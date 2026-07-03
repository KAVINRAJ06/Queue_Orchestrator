import cronParser from "cron-parser";
import type { Knex } from "knex";
import { db } from "../config/db.js";
import { env } from "../config/env.js";
import type { JobState, RetryStrategy } from "../types.js";
import { nextRetryDelay, shouldRetry } from "./retry.js";

export type ClaimedJob = {
  id: string;
  project_id: string;
  queue_id: string;
  name: string;
  type: string;
  state: JobState;
  priority: number;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
  worker_id: string;
  started_at?: Date;
};

export const claimNextJobSql = `
with eligible_queue as (
  select q.id, q.concurrency_limit
  from queues q
  where q.paused = false
    and q.deleted_at is null
    and (
      select count(*)
      from jobs active
      where active.queue_id = q.id
        and active.state in ('claimed', 'running')
    ) < q.concurrency_limit
  order by q.priority desc, q.created_at asc
),
candidate as (
  select j.id
  from jobs j
  join eligible_queue q on q.id = j.queue_id
  where j.state = 'queued'
    and (j.locked_until is null or j.locked_until <= now())
    and (j.scheduled_for is null or j.scheduled_for <= now())
  order by j.priority desc, j.created_at asc
  for update skip locked
  limit 1
)
update jobs j
set state = 'claimed',
    worker_id = ?,
    locked_until = now() + (? * interval '1 millisecond'),
    claimed_at = now(),
    last_heartbeat_at = now(),
    updated_at = now()
from candidate
where j.id = candidate.id
returning j.*
`;

export async function recordTransition(
  trx: Knex.Transaction,
  jobId: string,
  fromState: JobState | null,
  toState: JobState,
  reason: string,
  workerId?: string | null,
  metadata: Record<string, unknown> = {},
) {
  await trx("job_transitions").insert({
    job_id: jobId,
    from_state: fromState,
    to_state: toState,
    reason,
    worker_id: workerId ?? null,
    metadata: JSON.stringify(metadata),
  });
}

export async function appendLog(
  jobId: string,
  workerId: string | null,
  level: "info" | "warn" | "error",
  message: string,
  metadata: Record<string, unknown> = {},
  executionId?: string,
) {
  await db("job_logs").insert({
    job_id: jobId,
    execution_id: executionId ?? null,
    worker_id: workerId,
    level,
    message,
    metadata: JSON.stringify(metadata),
  });
}

export function nextCronDate(cronExpression: string, from = new Date()): Date | null {
  try {
    return cronParser.parseExpression(cronExpression, { currentDate: from }).next().toDate();
  } catch {
    return null;
  }
}

export async function promoteDueScheduledJobs(limit = 500): Promise<number> {
  return db.transaction(async (trx) => {
    const rows = await trx("jobs")
      .where("state", "scheduled")
      .where("scheduled_for", "<=", trx.fn.now())
      .limit(limit)
      .forUpdate()
      .skipLocked()
      .select("id", "state");
    for (const row of rows) {
      await trx("jobs").where({ id: row.id }).update({ state: "queued", updated_at: trx.fn.now() });
      await recordTransition(trx, row.id, "scheduled", "queued", "Scheduled time reached");
    }
    return rows.length;
  });
}

export async function enqueueDueRecurringSchedules(limit = 100): Promise<number> {
  return db.transaction(async (trx) => {
    const schedules = await trx("scheduled_jobs")
      .where({ active: true })
      .where("next_run_at", "<=", trx.fn.now())
      .limit(limit)
      .forUpdate()
      .skipLocked();
    for (const schedule of schedules) {
      const queue = await trx("queues")
        .join("retry_policies", "retry_policies.id", "queues.retry_policy_id")
        .where("queues.id", schedule.queue_id)
        .select("retry_policies.max_attempts")
        .first();
      const [job] = await trx("jobs")
        .insert({
          project_id: schedule.project_id,
          queue_id: schedule.queue_id,
          scheduled_job_id: schedule.id,
          name: schedule.name,
          type: "cron",
          state: "queued",
          priority: schedule.priority,
          payload: JSON.stringify(schedule.payload ?? {}),
          max_attempts: queue?.max_attempts ?? 3,
          scheduled_for: schedule.next_run_at,
        })
        .returning(["id"]);
      await recordTransition(trx, job.id, null, "queued", "Recurring schedule spawned job", null, { scheduleId: schedule.id });
      const next = nextCronDate(schedule.cron_expression, new Date(schedule.next_run_at));
      await trx("scheduled_jobs").where({ id: schedule.id }).update({
        last_run_at: schedule.next_run_at,
        next_run_at: next,
        active: next ? schedule.active : false,
        updated_at: trx.fn.now(),
      });
    }
    return schedules.length;
  });
}

export async function requeueStaleJobs(staleAfterMs = env.staleWorkerMs): Promise<number> {
  const staleBefore = new Date(Date.now() - staleAfterMs);
  return db.transaction(async (trx) => {
    const rows = await trx("jobs")
      .whereIn("state", ["claimed", "running"])
      .where("last_heartbeat_at", "<", staleBefore)
      .limit(500)
      .forUpdate()
      .skipLocked()
      .select("id", "state", "worker_id");
    for (const row of rows) {
      await trx("jobs").where({ id: row.id }).update({
        state: "queued",
        worker_id: null,
        locked_until: null,
        updated_at: trx.fn.now(),
      });
      await recordTransition(trx, row.id, row.state, "queued", "Worker heartbeat stale; job requeued", row.worker_id);
    }
    return rows.length;
  });
}

export async function claimNextJob(workerId: string, leaseMs = env.jobLeaseMs): Promise<ClaimedJob | null> {
  await promoteDueScheduledJobs();
  await enqueueDueRecurringSchedules();
  await requeueStaleJobs();

  return db.transaction(async (trx) => {
    const result = await trx.raw(claimNextJobSql, [workerId, leaseMs]);
    const job = result.rows?.[0] as ClaimedJob | undefined;
    if (!job) return null;
    await recordTransition(trx, job.id, "queued", "claimed", "Atomically claimed by worker", workerId, { leaseMs });
    return job;
  });
}

export async function markRunning(job: ClaimedJob): Promise<string> {
  return db.transaction(async (trx) => {
    const [updated] = await trx("jobs")
      .where({ id: job.id, worker_id: job.worker_id })
      .whereIn("state", ["claimed"])
      .update({
        state: "running",
        attempts: trx.raw("attempts + 1"),
        started_at: trx.fn.now(),
        last_heartbeat_at: trx.fn.now(),
        updated_at: trx.fn.now(),
      })
      .returning(["id", "attempts", "state"]);
    if (!updated) throw new Error(`Job ${job.id} was not claim-owned by ${job.worker_id}`);
    await recordTransition(trx, job.id, "claimed", "running", "Worker started execution", job.worker_id);
    const [execution] = await trx("job_executions")
      .insert({
        job_id: job.id,
        worker_id: job.worker_id,
        attempt_number: updated.attempts,
        state: "running",
        started_at: trx.fn.now(),
      })
      .returning(["id"]);
    return execution.id as string;
  });
}

export async function heartbeatJob(jobId: string, workerId: string, leaseMs = env.jobLeaseMs) {
  await db("jobs")
    .where({ id: jobId, worker_id: workerId })
    .whereIn("state", ["claimed", "running"])
    .update({
      last_heartbeat_at: db.fn.now(),
      locked_until: db.raw("now() + (? * interval '1 millisecond')", [leaseMs]),
      updated_at: db.fn.now(),
    });
}

export async function completeJob(job: ClaimedJob, executionId: string) {
  await db.transaction(async (trx) => {
    const [row] = await trx("jobs").where({ id: job.id }).select("state", "started_at", "attempts").forUpdate();
    const durationMs = row.started_at ? Date.now() - new Date(row.started_at).getTime() : 0;
    await trx("jobs").where({ id: job.id }).update({
      state: "completed",
      finished_at: trx.fn.now(),
      duration_ms: durationMs,
      locked_until: null,
      updated_at: trx.fn.now(),
    });
    await trx("job_executions").where({ id: executionId }).update({
      state: "completed",
      finished_at: trx.fn.now(),
      duration_ms: durationMs,
      updated_at: trx.fn.now(),
    });
    await recordTransition(trx, job.id, row.state, "completed", "Job completed successfully", job.worker_id, { durationMs });
  });
  await appendLog(job.id, job.worker_id, "info", "Job completed", {}, executionId);
}

export async function failJob(job: ClaimedJob, executionId: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  await db.transaction(async (trx) => {
    const [row] = await trx("jobs")
      .join("queues", "queues.id", "jobs.queue_id")
      .join("retry_policies", "retry_policies.id", "queues.retry_policy_id")
      .where("jobs.id", job.id)
      .select(
        "jobs.state",
        "jobs.started_at",
        "jobs.attempts",
        "jobs.max_attempts",
        "jobs.project_id",
        "jobs.queue_id",
        "jobs.payload",
        "retry_policies.strategy",
        "retry_policies.base_delay_ms",
        "retry_policies.multiplier",
        "retry_policies.max_delay_ms",
      )
      .forUpdate();
    const durationMs = row.started_at ? Date.now() - new Date(row.started_at).getTime() : 0;
    await trx("job_executions").where({ id: executionId }).update({
      state: "failed",
      error: message,
      finished_at: trx.fn.now(),
      duration_ms: durationMs,
      updated_at: trx.fn.now(),
    });

    if (shouldRetry(row.attempts, row.max_attempts)) {
      const delay = nextRetryDelay(
        {
          strategy: row.strategy as RetryStrategy,
          baseDelayMs: row.base_delay_ms,
          multiplier: row.multiplier,
          maxDelayMs: row.max_delay_ms,
        },
        row.attempts,
      );
      const nextRetryAt = new Date(Date.now() + delay);
      await trx("jobs").where({ id: job.id }).update({
        state: "scheduled",
        scheduled_for: nextRetryAt,
        locked_until: null,
        worker_id: null,
        error: message,
        finished_at: trx.fn.now(),
        duration_ms: durationMs,
        updated_at: trx.fn.now(),
      });
      await trx("job_executions").where({ id: executionId }).update({ next_retry_at: nextRetryAt });
      await recordTransition(trx, job.id, row.state, "failed", "Attempt failed", job.worker_id, { error: message });
      await recordTransition(trx, job.id, "failed", "retrying", "Retry delay calculated", job.worker_id, { nextRetryAt, delay });
      await recordTransition(trx, job.id, "retrying", "scheduled", "Retry scheduled", job.worker_id, { nextRetryAt });
      return;
    }

    await trx("jobs").where({ id: job.id }).update({
      state: "dead",
      locked_until: null,
      worker_id: null,
      error: message,
      finished_at: trx.fn.now(),
      duration_ms: durationMs,
      updated_at: trx.fn.now(),
    });
    await trx("job_executions").where({ id: executionId }).update({ state: "dead" });
    await trx("dead_letter_queue")
      .insert({
        job_id: job.id,
        project_id: row.project_id,
        queue_id: row.queue_id,
        reason: message,
        final_payload: JSON.stringify(row.payload ?? {}),
      })
      .onConflict("job_id")
      .merge({ reason: message, final_payload: JSON.stringify(row.payload ?? {}), created_at: trx.fn.now() });
    await recordTransition(trx, job.id, row.state, "failed", "Attempt failed", job.worker_id, { error: message });
    await recordTransition(trx, job.id, "failed", "dead", "Max attempts exhausted; moved to dead letter queue", job.worker_id);
  });
  await appendLog(job.id, job.worker_id, "error", message, {}, executionId);
}
