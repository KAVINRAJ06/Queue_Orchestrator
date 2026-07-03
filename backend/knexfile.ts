import "dotenv/config";
import type { Knex } from "knex";

const config: Record<string, Knex.Config> = {
  development: {
    client: "pg",
    connection: process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/queue_orchestrator",
    migrations: { directory: "./migrations", extension: "ts" },
    pool: { min: 0, max: Number(process.env.DB_POOL_MAX ?? 10) },
  },
  production: {
    client: "pg",
    connection: process.env.DATABASE_URL,
    migrations: { directory: "./migrations", extension: "js" },
    pool: { min: 2, max: Number(process.env.DB_POOL_MAX ?? 20) },
  },
};

export default config;
