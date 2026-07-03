import type { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import { z } from "zod";
import { db } from "../config/db.js";
import { notFound } from "../lib/errors.js";
import { appendLog, claimNextJob, nextCronDate, recordTransition } from "../services/scheduler.js";

const createJobSchema = z.object({
  projectId: z.string().uuid(),
  queueId: z.string().uuid(),
  name: z.string().min(2),
  type: z.enum(["immediate", "delayed", "scheduled", "cron", "batch"]).default("immediate"),
  priority: z.coerce.number().int().default(0),
  payload: z.record(z.any()).default({}),
  idempotencyKey: z.string().min(1).optional(),
  scheduledFor: z.coerce.date().optional(),
  delayMs: z.coerce.number().int().min(0).optional(),
  cronExpression: z.string().optional(),
  batch: z.array(z.record(z.any())).optional(),
});

function mapJob(j: any) {
  return {
    id: j.id,
    project_id: j.project_id,
    queue_id: j.queue_id,
    name: j.name,
    type: j.type,
    state: j.state,
    priority: String(j.priority),
    payload: j.payload,
    attempts: j.attempts,
    max_attempts: j.max_attempts,
    worker_id: j.worker_id,
    error: j.error,
    created_at: j.created_at,
    started_at: j.started_at,
    finished_at: j.finished_at,
    scheduled_for: j.scheduled_for,
    duration_ms: j.duration_ms,
  };
}

export async function jobRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: app.requireAuth }, async (request) => {
    const query = z.object({
      projectId: z.string().uuid().optional(),
      queueId: z.string().uuid().optional(),
      state: z.string().optional(),
      type: z.string().optional(),
      page: z.coerce.number().int().min(0).default(0),
      limit: z.coerce.number().int().min(1).max(100).default(20),
      search: z.string().optional(),
    }).parse(request.query);
    const base = db("jobs")
      .modify((qb) => {
        if (query.projectId) qb.where("project_id", query.projectId);
        if (query.queueId) qb.where("queue_id", query.queueId);
        if (query.state && query.state !== "all") qb.where("state", query.state);
        if (query.type && query.type !== "all") qb.where("type", query.type);
        if (query.search) qb.whereILike("name", `%${query.search}%`);
      });
    const [{ count }] = await base.clone().count({ count: "*" });
    const rows = await base.clone().orderBy("created_at", "desc").offset(query.page * query.limit).limit(query.limit);
    return { rows: rows.map(mapJob), total: Number(count) };
  });

  app.post("/", { preHandler: app.requireAuth }, async (request, reply) => {
    const body = createJobSchema.parse(request.body);
    const queue = await db("queues")
      .join("retry_policies", "retry_policies.id", "queues.retry_policy_id")
      .where("queues.id", body.queueId)
      .select("queues.id", "retry_policies.max_attempts")
      .first();
    if (!queue) throw notFound("Queue not found");

    const scheduledFor = body.delayMs ? new Date(Date.now() + body.delayMs) : body.scheduledFor;
    const state = scheduledFor && scheduledFor > new Date() ? "scheduled" : "queued";

    if (body.type === "cron") {
      if (!body.cronExpression) throw new Error("cronExpression is required for cron jobs");
      const nextRunAt = body.scheduledFor ?? nextCronDate(body.cronExpression);
      if (!nextRunAt) return reply.status(400).send({ error: { code: "invalid_cron", message: "Invalid cron expression" } });
      const [schedule] = await db("scheduled_jobs").insert({
        project_id: body.projectId,
        queue_id: body.queueId,
        name: body.name,
        cron_expression: body.cronExpression,
        payload: JSON.stringify(body.payload),
        priority: body.priority,
        next_run_at: nextRunAt,
      }).returning(["id", "next_run_at"]);
      return reply.status(201).send({ id: schedule.id, type: "schedule", next_run_at: schedule.next_run_at });
    }

    if (body.batch?.length) {
      const batchId = nanoid(10);
      const jobs = await db.transaction(async (trx) => {
        const inserted = await trx("jobs").insert(body.batch!.map((payload, index) => ({
          project_id: body.projectId,
          queue_id: body.queueId,
          name: `${body.name} #${index + 1}`,
          type: "batch",
          state,
          priority: body.priority,
          payload: JSON.stringify(payload),
          batch_id: batchId,
          scheduled_for: scheduledFor,
          max_attempts: queue.max_attempts,
        }))).returning(["id", "state"]);
        for (const job of inserted) await recordTransition(trx, job.id, null, job.state, "Batch job created", null, { batchId });
        return inserted;
      });
      return reply.status(201).send({ batchId, ids: jobs.map((j) => j.id) });
    }

    const [job] = await db.transaction(async (trx) => {
      const rows = await trx("jobs").insert({
        project_id: body.projectId,
        queue_id: body.queueId,
        name: body.name,
        type: body.type,
        state,
        priority: body.priority,
        payload: JSON.stringify(body.payload),
        idempotency_key: body.idempotencyKey,
        scheduled_for: scheduledFor,
        max_attempts: queue.max_attempts,
      }).returning("*");
      await recordTransition(trx, rows[0].id, null, rows[0].state, `Job created in ${rows[0].state} state`);
      return rows;
    });
    await appendLog(job.id, null, "info", `Job created in ${job.state} state`);
    reply.status(201).send(mapJob(job));
  });

  app.get("/batches/:batchId/status", { preHandler: app.requireAuth }, async (request) => {
    const { batchId } = z.object({ batchId: z.string() }).parse(request.params);
    const rows = await db("jobs").where({ batch_id: batchId }).select("state").count({ count: "*" }).groupBy("state");
    const typedRows = rows as Array<{ state: string; count: string | number }>;
    return { batchId, total: typedRows.reduce((sum, row) => sum + Number(row.count), 0), states: Object.fromEntries(typedRows.map((r) => [r.state, Number(r.count)])) };
  });

  app.get("/schedules/recurring", { preHandler: app.requireAuth }, async (request) => {
    const query = z.object({ projectId: z.string().uuid().optional(), queueId: z.string().uuid().optional() }).parse(request.query);
    return db("scheduled_jobs").modify((qb) => {
      if (query.projectId) qb.where("project_id", query.projectId);
      if (query.queueId) qb.where("queue_id", query.queueId);
    }).orderBy("next_run_at", "asc");
  });

  app.get("/dead-letter", { preHandler: app.requireAuth }, async (request) => {
    const query = z.object({ projectId: z.string().uuid().optional(), queueId: z.string().uuid().optional() }).parse(request.query);
    return db("dead_letter_queue").modify((qb) => {
      if (query.projectId) qb.where("project_id", query.projectId);
      if (query.queueId) qb.where("queue_id", query.queueId);
    }).orderBy("created_at", "desc").limit(100);
  });

  app.post("/dead-letter/:jobId/requeue", { preHandler: app.requireAuth }, async (request) => {
    const { jobId } = z.object({ jobId: z.string().uuid() }).parse(request.params);
    await db.transaction(async (trx) => {
      const job = await trx("jobs").where({ id: jobId }).first().forUpdate();
      if (!job) throw notFound("Job not found");
      await trx("dead_letter_queue").where({ job_id: jobId }).delete();
      await trx("jobs").where({ id: jobId }).update({ state: "queued", worker_id: null, error: null, scheduled_for: null, locked_until: null, updated_at: trx.fn.now() });
      await recordTransition(trx, jobId, job.state, "queued", "Dead-letter job manually requeued");
    });
    return db("jobs").where({ id: jobId }).first().then(mapJob);
  });

  app.post("/claim/next", { preHandler: app.requireAuth }, async (request) => {
    const workerId = z.object({ workerId: z.string().default("api-worker") }).parse(request.body ?? {}).workerId;
    const job = await claimNextJob(workerId);
    return job ? mapJob(job) : null;
  });

  app.get("/:id", { preHandler: app.requireAuth }, async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const job = await db("jobs").where({ id }).first();
    if (!job) throw notFound("Job not found");
    return mapJob(job);
  });

  app.get("/:id/executions", { preHandler: app.requireAuth }, async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    return db("job_executions").where({ job_id: id }).orderBy("attempt_number", "desc");
  });

  app.get("/:id/logs", { preHandler: app.requireAuth }, async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    return db("job_logs").where({ job_id: id }).orderBy("created_at", "asc");
  });

  app.get("/:id/timeline", { preHandler: app.requireAuth }, async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    return db("job_transitions").where({ job_id: id }).orderBy("created_at", "asc");
  });

  app.post("/:id/retry", { preHandler: app.requireAuth }, async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    await db.transaction(async (trx) => {
      const job = await trx("jobs").where({ id }).first().forUpdate();
      if (!job) throw notFound("Job not found");
      await trx("dead_letter_queue").where({ job_id: id }).delete();
      await trx("jobs").where({ id }).update({ state: "queued", worker_id: null, error: null, scheduled_for: null, locked_until: null, updated_at: trx.fn.now() });
      await recordTransition(trx, id, job.state, "queued", "Job manually requeued");
    });
    return db("jobs").where({ id }).first().then(mapJob);
  });
}
