import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../config/db.js";
import { notFound } from "../lib/errors.js";

const queueSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().min(2),
  priority: z.coerce.number().int().default(0),
  concurrencyLimit: z.coerce.number().int().min(1).max(100).default(5),
  paused: z.boolean().optional(),
  retryPolicy: z.object({
    strategy: z.enum(["fixed", "linear", "exponential"]).default("exponential"),
    maxAttempts: z.coerce.number().int().min(1).max(20).default(3),
    delayMs: z.coerce.number().int().min(0).default(5000),
    baseDelayMs: z.coerce.number().int().min(0).optional(),
    multiplier: z.coerce.number().min(1).default(2),
    maxDelayMs: z.coerce.number().int().min(0).default(60000),
  }).optional(),
  rateLimitPerMinute: z.coerce.number().int().min(0).default(0),
});

function mapQueue(q: any) {
  return {
    id: q.id,
    project_id: q.project_id,
    name: q.name,
    priority: q.priority,
    concurrencyLimit: q.concurrency_limit,
    paused: q.paused,
    rateLimitPerMinute: q.rate_limit_per_minute,
    retryPolicy: {
      strategy: q.strategy,
      maxAttempts: q.max_attempts,
      delayMs: q.base_delay_ms,
      baseDelayMs: q.base_delay_ms,
      multiplier: Number(q.multiplier),
      maxDelayMs: q.max_delay_ms,
    },
    stats: {
      queued: Number(q.queued ?? 0),
      scheduled: Number(q.scheduled ?? 0),
      running: Number(q.running ?? 0),
      claimed: Number(q.claimed ?? 0),
      completed: Number(q.completed ?? 0),
      failed: Number(q.failed ?? 0),
      dead: Number(q.dead ?? 0),
      waiting: Number(q.queued ?? 0) + Number(q.scheduled ?? 0),
      active: Number(q.running ?? 0) + Number(q.claimed ?? 0),
      avgDurationMs: Number(q.avg_duration_ms ?? 0),
    },
  };
}

export async function queueRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: app.requireAuth }, async (request) => {
    const query = z.object({ projectId: z.string().uuid().optional() }).parse(request.query);
    const rows = await db("queues")
      .join("retry_policies", "retry_policies.id", "queues.retry_policy_id")
      .leftJoin(
        db("jobs")
          .select("queue_id")
          .count({ total: "*" })
          .sum({ queued: db.raw("case when state = 'queued' then 1 else 0 end") })
          .sum({ scheduled: db.raw("case when state = 'scheduled' then 1 else 0 end") })
          .sum({ claimed: db.raw("case when state = 'claimed' then 1 else 0 end") })
          .sum({ running: db.raw("case when state = 'running' then 1 else 0 end") })
          .sum({ completed: db.raw("case when state = 'completed' then 1 else 0 end") })
          .sum({ failed: db.raw("case when state = 'failed' then 1 else 0 end") })
          .sum({ dead: db.raw("case when state = 'dead' then 1 else 0 end") })
          .avg({ avg_duration_ms: "duration_ms" })
          .groupBy("queue_id")
          .as("stats"),
        "stats.queue_id",
        "queues.id",
      )
      .whereNull("queues.deleted_at")
      .modify((qb) => {
        if (query.projectId) qb.where("queues.project_id", query.projectId);
      })
      .select("queues.*", "retry_policies.*", "stats.*")
      .orderBy([{ column: "queues.priority", order: "desc" }, { column: "queues.name", order: "asc" }]);
    return rows.map(mapQueue);
  });

  app.post("/", { preHandler: app.requireAuth }, async (request, reply) => {
    const body = queueSchema.parse(request.body);
    const [queue] = await db.transaction(async (trx) => {
      const policy = {
        strategy: "exponential" as const,
        maxAttempts: 3,
        delayMs: 5000,
        multiplier: 2,
        maxDelayMs: 60000,
        ...body.retryPolicy,
      };
      const [retry] = await trx("retry_policies")
        .insert({
          strategy: policy.strategy,
          max_attempts: policy.maxAttempts,
          base_delay_ms: policy.baseDelayMs ?? policy.delayMs,
          multiplier: policy.multiplier,
          max_delay_ms: policy.maxDelayMs,
        })
        .returning(["id"]);
      const inserted = await trx("queues")
        .insert({
          project_id: body.projectId,
          retry_policy_id: retry.id,
          name: body.name,
          priority: body.priority,
          concurrency_limit: body.concurrencyLimit,
          paused: body.paused ?? false,
          rate_limit_per_minute: body.rateLimitPerMinute,
        })
        .returning(["id"]);
      return inserted;
    });
    reply.status(201).send({ id: queue.id });
  });

  app.patch("/:id", { preHandler: app.requireAuth }, async (request) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = queueSchema.partial({ projectId: true, name: true }).parse(request.body);
    const queue = await db("queues").where({ id: params.id }).first();
    if (!queue) throw notFound("Queue not found");
    await db.transaction(async (trx) => {
      if (body.retryPolicy) {
        await trx("retry_policies").where({ id: queue.retry_policy_id }).update({
          strategy: body.retryPolicy.strategy,
          max_attempts: body.retryPolicy.maxAttempts,
          base_delay_ms: body.retryPolicy.baseDelayMs ?? body.retryPolicy.delayMs,
          multiplier: body.retryPolicy.multiplier,
          max_delay_ms: body.retryPolicy.maxDelayMs,
          updated_at: trx.fn.now(),
        });
      }
      await trx("queues").where({ id: params.id }).update({
        ...(body.name ? { name: body.name } : {}),
        ...(body.priority !== undefined ? { priority: body.priority } : {}),
        ...(body.concurrencyLimit !== undefined ? { concurrency_limit: body.concurrencyLimit } : {}),
        ...(body.paused !== undefined ? { paused: body.paused } : {}),
        ...(body.rateLimitPerMinute !== undefined ? { rate_limit_per_minute: body.rateLimitPerMinute } : {}),
        updated_at: trx.fn.now(),
      });
    });
    return { id: params.id };
  });

  app.post("/:id/pause", { preHandler: app.requireAuth }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    await db("queues").where({ id }).update({ paused: true, updated_at: db.fn.now() });
    reply.status(204).send();
  });

  app.post("/:id/resume", { preHandler: app.requireAuth }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    await db("queues").where({ id }).update({ paused: false, updated_at: db.fn.now() });
    reply.status(204).send();
  });
}
