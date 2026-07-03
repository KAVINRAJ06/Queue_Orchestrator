import type { FastifyInstance } from "fastify";
import { db } from "../config/db.js";
import { env } from "../config/env.js";

export async function workerRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: app.requireAuth }, async () => {
    const rows = await db("workers").orderBy("last_heartbeat_at", "desc");
    const cutoff = Date.now() - env.staleWorkerMs;
    return rows.map((w) => ({
      id: w.id,
      worker_id: w.id,
      hostname: w.hostname,
      state: new Date(w.last_heartbeat_at).getTime() < cutoff ? "dead" : w.state,
      concurrency: w.concurrency,
      runningJobs: w.running_jobs,
      metrics: { completed: w.completed_count, failed: w.failed_count },
      lastHeartbeatAt: w.last_heartbeat_at,
      startedAt: w.started_at,
    }));
  });
}
