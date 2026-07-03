import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../config/db.js";

export async function metricRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: app.requireAuth }, async (request) => {
    const query = z.object({ projectId: z.string().uuid().optional() }).parse(request.query);
    const counts = await db("jobs")
      .modify((qb) => {
        if (query.projectId) qb.where("project_id", query.projectId);
      })
      .select("state")
      .count({ count: "*" })
      .groupBy("state");
    const throughput = await db("jobs")
      .modify((qb) => {
        if (query.projectId) qb.where("project_id", query.projectId);
      })
      .where("finished_at", ">", db.raw("now() - interval '24 hours'"))
      .select(db.raw("date_trunc('hour', finished_at) as bucket"))
      .count({ completed: "*" })
      .groupBy("bucket")
      .orderBy("bucket", "asc");
    const [duration] = await db("jobs")
      .modify((qb) => {
        if (query.projectId) qb.where("project_id", query.projectId);
      })
      .whereNotNull("duration_ms")
      .avg({ avgDurationMs: "duration_ms" });
    const typedCounts = counts as Array<{ state: string; count: string | number }>;
    const typedThroughput = throughput as Array<{ bucket: Date; completed: string | number }>;
    return {
      states: Object.fromEntries(typedCounts.map((row) => [row.state, Number(row.count)])),
      throughput: typedThroughput.map((row) => ({ bucket: row.bucket, completed: Number(row.completed) })),
      avgDurationMs: Math.round(Number(duration?.avgDurationMs ?? 0)),
    };
  });

  app.get("/prometheus", async (_request, reply) => {
    const rows = await db("jobs").select("state").count({ count: "*" }).groupBy("state") as Array<{ state: string; count: string | number }>;
    reply.type("text/plain").send(rows.map((r) => `queue_orchestrator_jobs{state="${r.state}"} ${r.count}`).join("\n"));
  });
}
