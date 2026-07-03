import knex, { type Knex } from "knex";
import { Redis } from "ioredis";
import { env } from "./env.js";

export const db: Knex = knex({
  client: "pg",
  connection: env.databaseUrl,
  pool: { min: 0, max: Number(process.env.DB_POOL_MAX ?? 20) },
});

export const redis = new Redis(env.redisUrl, {
  lazyConnect: true,
  maxRetriesPerRequest: 2,
});

export async function closeInfrastructure() {
  await Promise.allSettled([db.destroy(), redis.quit()]);
}
