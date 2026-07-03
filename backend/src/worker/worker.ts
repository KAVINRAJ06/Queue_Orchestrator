import os from "node:os";
import { nanoid } from "nanoid";
import { db, redis, closeInfrastructure } from "../config/db.js";
import { env } from "../config/env.js";
import { appendLog, claimNextJob, completeJob, failJob, heartbeatJob, markRunning, type ClaimedJob } from "../services/scheduler.js";

const workerId = process.env.WORKER_ID ?? `worker-${nanoid(8)}`;
const running = new Set<Promise<void>>();
let draining = false;

await redis.connect().catch(() => undefined);
await db("workers")
  .insert({
    id: workerId,
    hostname: os.hostname(),
    state: "online",
    concurrency: env.workerConcurrency,
    running_jobs: 0,
    last_heartbeat_at: db.fn.now(),
  })
  .onConflict("id")
  .merge({
    hostname: os.hostname(),
    state: "online",
    concurrency: env.workerConcurrency,
    running_jobs: 0,
    last_heartbeat_at: db.fn.now(),
    started_at: db.fn.now(),
    updated_at: db.fn.now(),
  });

console.log(JSON.stringify({ level: "info", workerId, msg: "worker online", concurrency: env.workerConcurrency }));

const heartbeatTimer = setInterval(async () => {
  await db("workers").where({ id: workerId }).update({
    state: draining ? "draining" : "online",
    running_jobs: running.size,
    last_heartbeat_at: db.fn.now(),
    updated_at: db.fn.now(),
  }).catch((error) => console.error(JSON.stringify({ level: "error", workerId, error: String(error) })));
}, env.heartbeatIntervalMs);
heartbeatTimer.unref();

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

while (!draining) {
  while (running.size < env.workerConcurrency && !draining) {
    const job = await claimNextJob(workerId);
    if (!job) break;
    const promise = execute(job).finally(() => running.delete(promise));
    running.add(promise);
  }
  await sleep(env.pollIntervalMs);
}

async function execute(job: ClaimedJob) {
  let executionId: string | null = null;
  const heartbeat = setInterval(() => heartbeatJob(job.id, workerId).catch(() => undefined), env.heartbeatIntervalMs);
  try {
    executionId = await markRunning(job);
    await appendLog(job.id, workerId, "info", "Job execution started", {}, executionId);
    await runPayload(job.payload);
    await completeJob(job, executionId);
    await db("workers").where({ id: workerId }).increment("completed_count", 1);
    await redis.publish("jobs", JSON.stringify({ type: "job.completed", jobId: job.id })).catch(() => 0);
  } catch (error) {
    if (executionId) await failJob(job, executionId, error);
    else await appendLog(job.id, workerId, "error", error instanceof Error ? error.message : String(error));
    await db("workers").where({ id: workerId }).increment("failed_count", 1);
    await redis.publish("jobs", JSON.stringify({ type: "job.failed", jobId: job.id })).catch(() => 0);
  } finally {
    clearInterval(heartbeat);
  }
}

async function runPayload(payload: Record<string, unknown> = {}) {
  const ms = Math.min(Number(payload.ms ?? 1000), 30000);
  await sleep(ms);
  const failRate = Number(payload.failRate ?? 0);
  if (payload.fail === true || (failRate > 0 && Math.random() < failRate)) {
    throw new Error(String(payload.errorMessage ?? "Simulated worker failure"));
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function shutdown() {
  draining = true;
  clearInterval(heartbeatTimer);
  await db("workers").where({ id: workerId }).update({ state: "draining", last_heartbeat_at: db.fn.now() }).catch(() => undefined);
  await Promise.allSettled([...running]);
  await db("workers").where({ id: workerId }).update({ state: "offline", running_jobs: 0, last_heartbeat_at: db.fn.now() }).catch(() => undefined);
  await closeInfrastructure();
  process.exit(0);
}
