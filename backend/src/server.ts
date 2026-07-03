import { closeInfrastructure, redis } from "./config/db.js";
import { env } from "./config/env.js";
import { createApp } from "./app.js";

const app = await createApp();

try {
  await redis.connect().catch((error: unknown) => app.log.warn({ err: error }, "Redis unavailable; continuing without pub/sub"));
  await app.listen({ port: env.port, host: "0.0.0.0" });
} catch (error) {
  app.log.error({ err: error }, "API failed to start");
  await closeInfrastructure();
  process.exit(1);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    app.log.info({ signal }, "Shutting down API");
    await app.close();
    await closeInfrastructure();
    process.exit(0);
  });
}
