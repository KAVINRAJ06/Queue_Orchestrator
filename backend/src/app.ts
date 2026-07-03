import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import Fastify from "fastify";
import { randomUUID } from "node:crypto";
import { env } from "./config/env.js";
import { errorHandler } from "./lib/errors.js";
import { authPlugin } from "./plugins/auth.js";
import { authRoutes } from "./routes/auth.js";
import { jobRoutes } from "./routes/jobs.js";
import { metricRoutes } from "./routes/metrics.js";
import { projectRoutes } from "./routes/projects.js";
import { queueRoutes } from "./routes/queues.js";
import { workerRoutes } from "./routes/workers.js";

export async function createApp() {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? "info" },
    genReqId: (req) => String(req.headers["x-request-id"] ?? randomUUID()),
  });

  await app.register(cors, { origin: env.corsOrigin, credentials: true });
  await app.register(rateLimit, { max: 600, timeWindow: "1 minute" });
  await app.register(swagger, {
    openapi: {
      info: {
        title: "Distributed Job Scheduler API",
        version: "2.0.0",
        description: "REST API for auth, projects, queues, jobs, workers, logs, metrics, recurring schedules, and DLQ operations.",
      },
      components: { securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } } },
      security: [{ bearerAuth: [] }],
    },
  });
  await app.register(swaggerUi, { routePrefix: "/docs" });
  await app.register(authPlugin);

  app.setErrorHandler(errorHandler);
  app.addHook("onRequest", async (request, reply) => {
    reply.header("x-request-id", request.id);
  });

  app.get("/health", async () => ({ ok: true, service: "queue-orchestrator-api" }));
  await app.register(authRoutes, { prefix: "/api/auth" });
  await app.register(projectRoutes, { prefix: "/api/projects" });
  await app.register(queueRoutes, { prefix: "/api/queues" });
  await app.register(jobRoutes, { prefix: "/api/jobs" });
  await app.register(workerRoutes, { prefix: "/api/workers" });
  await app.register(metricRoutes, { prefix: "/api/metrics" });

  app.setNotFoundHandler((_request, reply) => {
    reply.status(404).send({ error: { code: "not_found", message: "Route not found" } });
  });

  return app;
}
