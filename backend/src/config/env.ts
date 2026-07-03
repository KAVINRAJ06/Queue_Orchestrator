import "dotenv/config";

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/queue_orchestrator",
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  jwtSecret: process.env.JWT_SECRET ?? "dev-secret-change-me",
  jwtIssuer: process.env.JWT_ISSUER ?? "queue-orchestrator",
  accessTokenTtl: process.env.ACCESS_TOKEN_TTL ?? "15m",
  refreshTokenTtl: process.env.REFRESH_TOKEN_TTL ?? "7d",
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  workerConcurrency: Number(process.env.WORKER_CONCURRENCY ?? 4),
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS ?? 1000),
  heartbeatIntervalMs: Number(process.env.HEARTBEAT_INTERVAL_MS ?? 5000),
  jobLeaseMs: Number(process.env.JOB_LEASE_MS ?? 30000),
  staleWorkerMs: Number(process.env.STALE_WORKER_MS ?? 45000),
};
