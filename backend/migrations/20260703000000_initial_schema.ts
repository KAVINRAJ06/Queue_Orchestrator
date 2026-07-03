import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw('create extension if not exists "pgcrypto"');
  await knex.raw("create type org_role as enum ('owner', 'admin', 'member')");
  await knex.raw("create type job_state as enum ('queued', 'scheduled', 'claimed', 'running', 'completed', 'failed', 'retrying', 'dead')");
  await knex.raw("create type retry_strategy as enum ('fixed', 'linear', 'exponential')");
  await knex.raw("create type worker_state as enum ('online', 'draining', 'offline', 'dead')");

  await knex.schema.createTable("users", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.text("email").notNullable().unique();
    t.text("name").notNullable();
    t.text("password_hash").notNullable();
    t.timestamps(true, true);
  });

  await knex.schema.createTable("organizations", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.text("name").notNullable();
    t.uuid("owner_user_id").notNullable().references("id").inTable("users").onDelete("restrict");
    t.timestamp("deleted_at");
    t.timestamps(true, true);
  });

  await knex.schema.createTable("organization_members", (t) => {
    t.uuid("organization_id").notNullable().references("id").inTable("organizations").onDelete("cascade");
    t.uuid("user_id").notNullable().references("id").inTable("users").onDelete("cascade");
    t.specificType("role", "org_role").notNullable().defaultTo("member");
    t.timestamps(true, true);
    t.primary(["organization_id", "user_id"]);
  });

  await knex.schema.createTable("projects", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("organization_id").notNullable().references("id").inTable("organizations").onDelete("restrict");
    t.text("name").notNullable();
    t.timestamp("deleted_at");
    t.timestamps(true, true);
    t.unique(["organization_id", "name"]);
  });

  await knex.schema.createTable("retry_policies", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.specificType("strategy", "retry_strategy").notNullable().defaultTo("exponential");
    t.integer("max_attempts").notNullable().defaultTo(3);
    t.integer("base_delay_ms").notNullable().defaultTo(5000);
    t.numeric("multiplier").notNullable().defaultTo(2);
    t.integer("max_delay_ms").notNullable().defaultTo(60000);
    t.timestamps(true, true);
  });

  await knex.schema.createTable("queues", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("project_id").notNullable().references("id").inTable("projects").onDelete("restrict");
    t.uuid("retry_policy_id").notNullable().references("id").inTable("retry_policies").onDelete("restrict");
    t.text("name").notNullable();
    t.integer("priority").notNullable().defaultTo(0);
    t.integer("concurrency_limit").notNullable().defaultTo(5);
    t.boolean("paused").notNullable().defaultTo(false);
    t.integer("rate_limit_per_minute").notNullable().defaultTo(0);
    t.timestamp("deleted_at");
    t.timestamps(true, true);
    t.unique(["project_id", "name"]);
    t.index(["project_id", "paused", "priority"]);
  });

  await knex.schema.createTable("scheduled_jobs", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("project_id").notNullable().references("id").inTable("projects").onDelete("restrict");
    t.uuid("queue_id").notNullable().references("id").inTable("queues").onDelete("restrict");
    t.text("name").notNullable();
    t.text("cron_expression").notNullable();
    t.jsonb("payload").notNullable().defaultTo("{}");
    t.integer("priority").notNullable().defaultTo(0);
    t.boolean("active").notNullable().defaultTo(true);
    t.timestamp("last_run_at");
    t.timestamp("next_run_at").notNullable();
    t.timestamps(true, true);
    t.index(["active", "next_run_at"]);
  });

  await knex.schema.createTable("jobs", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("project_id").notNullable().references("id").inTable("projects").onDelete("restrict");
    t.uuid("queue_id").notNullable().references("id").inTable("queues").onDelete("restrict");
    t.uuid("scheduled_job_id").references("id").inTable("scheduled_jobs").onDelete("set null");
    t.text("name").notNullable();
    t.text("type").notNullable().defaultTo("immediate");
    t.specificType("state", "job_state").notNullable().defaultTo("queued");
    t.integer("priority").notNullable().defaultTo(0);
    t.jsonb("payload").notNullable().defaultTo("{}");
    t.text("idempotency_key");
    t.text("batch_id");
    t.integer("attempts").notNullable().defaultTo(0);
    t.integer("max_attempts").notNullable().defaultTo(3);
    t.text("worker_id");
    t.timestamp("scheduled_for");
    t.timestamp("locked_until");
    t.timestamp("claimed_at");
    t.timestamp("started_at");
    t.timestamp("finished_at");
    t.timestamp("last_heartbeat_at");
    t.integer("duration_ms");
    t.text("error");
    t.timestamps(true, true);
    t.index(["queue_id", "state", "scheduled_for", "priority", "created_at"], "idx_jobs_claim_candidates");
    t.index(["project_id", "state", "created_at"], "idx_jobs_explorer");
    t.index(["batch_id"]);
    t.index(["worker_id", "state"]);
    t.unique(["project_id", "idempotency_key"], {
      indexName: "jobs_project_idempotency_unique",
      predicate: knex.whereRaw("idempotency_key is not null"),
    });
  });

  await knex.schema.createTable("workers", (t) => {
    t.text("id").primary();
    t.text("hostname").notNullable();
    t.specificType("state", "worker_state").notNullable().defaultTo("online");
    t.integer("concurrency").notNullable().defaultTo(1);
    t.integer("running_jobs").notNullable().defaultTo(0);
    t.integer("completed_count").notNullable().defaultTo(0);
    t.integer("failed_count").notNullable().defaultTo(0);
    t.timestamp("last_heartbeat_at").notNullable();
    t.timestamp("started_at").notNullable().defaultTo(knex.fn.now());
    t.timestamps(true, true);
    t.index(["last_heartbeat_at"]);
  });

  await knex.schema.createTable("job_executions", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("job_id").notNullable().references("id").inTable("jobs").onDelete("cascade");
    t.text("worker_id").references("id").inTable("workers").onDelete("set null");
    t.integer("attempt_number").notNullable();
    t.specificType("state", "job_state").notNullable();
    t.timestamp("started_at");
    t.timestamp("finished_at");
    t.integer("duration_ms");
    t.text("error");
    t.timestamp("next_retry_at");
    t.timestamps(true, true);
    t.unique(["job_id", "attempt_number"]);
  });

  await knex.schema.createTable("job_logs", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("job_id").notNullable().references("id").inTable("jobs").onDelete("cascade");
    t.uuid("execution_id").references("id").inTable("job_executions").onDelete("cascade");
    t.text("worker_id").references("id").inTable("workers").onDelete("set null");
    t.text("level").notNullable();
    t.text("message").notNullable();
    t.jsonb("metadata").notNullable().defaultTo("{}");
    t.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    t.index(["job_id", "created_at"]);
  });

  await knex.schema.createTable("job_transitions", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("job_id").notNullable().references("id").inTable("jobs").onDelete("cascade");
    t.specificType("from_state", "job_state");
    t.specificType("to_state", "job_state").notNullable();
    t.text("worker_id");
    t.text("reason").notNullable();
    t.jsonb("metadata").notNullable().defaultTo("{}");
    t.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    t.index(["job_id", "created_at"]);
  });

  await knex.schema.createTable("dead_letter_queue", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("job_id").notNullable().unique().references("id").inTable("jobs").onDelete("cascade");
    t.uuid("project_id").notNullable().references("id").inTable("projects").onDelete("restrict");
    t.uuid("queue_id").notNullable().references("id").inTable("queues").onDelete("restrict");
    t.text("reason").notNullable();
    t.jsonb("final_payload").notNullable().defaultTo("{}");
    t.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    t.index(["project_id", "queue_id", "created_at"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("dead_letter_queue");
  await knex.schema.dropTableIfExists("job_transitions");
  await knex.schema.dropTableIfExists("job_logs");
  await knex.schema.dropTableIfExists("job_executions");
  await knex.schema.dropTableIfExists("workers");
  await knex.schema.dropTableIfExists("jobs");
  await knex.schema.dropTableIfExists("scheduled_jobs");
  await knex.schema.dropTableIfExists("queues");
  await knex.schema.dropTableIfExists("retry_policies");
  await knex.schema.dropTableIfExists("projects");
  await knex.schema.dropTableIfExists("organization_members");
  await knex.schema.dropTableIfExists("organizations");
  await knex.schema.dropTableIfExists("users");
  await knex.raw("drop type if exists worker_state");
  await knex.raw("drop type if exists retry_strategy");
  await knex.raw("drop type if exists job_state");
  await knex.raw("drop type if exists org_role");
}
