# ER Diagram

```mermaid
erDiagram
  USERS ||--o{ ORGANIZATION_MEMBERS : belongs_to
  USERS ||--o{ ORGANIZATIONS : owns
  ORGANIZATIONS ||--o{ ORGANIZATION_MEMBERS : has
  ORGANIZATIONS ||--o{ PROJECTS : contains
  PROJECTS ||--o{ QUEUES : owns
  RETRY_POLICIES ||--o{ QUEUES : configures
  QUEUES ||--o{ JOBS : contains
  QUEUES ||--o{ SCHEDULED_JOBS : defines
  SCHEDULED_JOBS ||--o{ JOBS : spawns
  JOBS ||--o{ JOB_EXECUTIONS : attempts
  JOBS ||--o{ JOB_LOGS : emits
  JOBS ||--o{ JOB_TRANSITIONS : changes
  JOBS ||--o| DEAD_LETTER_QUEUE : final_failure
  WORKERS ||--o{ JOB_EXECUTIONS : runs

  USERS {
    uuid id PK
    text email UK
    text name
    text password_hash
  }
  ORGANIZATIONS {
    uuid id PK
    uuid owner_user_id FK
    text name
    timestamp deleted_at
  }
  ORGANIZATION_MEMBERS {
    uuid organization_id FK
    uuid user_id FK
    org_role role
  }
  PROJECTS {
    uuid id PK
    uuid organization_id FK
    text name
    timestamp deleted_at
  }
  RETRY_POLICIES {
    uuid id PK
    retry_strategy strategy
    int max_attempts
    int base_delay_ms
    numeric multiplier
    int max_delay_ms
  }
  QUEUES {
    uuid id PK
    uuid project_id FK
    uuid retry_policy_id FK
    text name
    int priority
    int concurrency_limit
    boolean paused
    timestamp deleted_at
  }
  SCHEDULED_JOBS {
    uuid id PK
    uuid project_id FK
    uuid queue_id FK
    text cron_expression
    jsonb payload
    boolean active
    timestamp next_run_at
    timestamp last_run_at
  }
  JOBS {
    uuid id PK
    uuid project_id FK
    uuid queue_id FK
    uuid scheduled_job_id FK
    job_state state
    int priority
    jsonb payload
    text idempotency_key
    text batch_id
    int attempts
    int max_attempts
    text worker_id
    timestamp scheduled_for
    timestamp locked_until
  }
  WORKERS {
    text id PK
    text hostname
    worker_state state
    int concurrency
    int running_jobs
    timestamp last_heartbeat_at
  }
  JOB_EXECUTIONS {
    uuid id PK
    uuid job_id FK
    text worker_id FK
    int attempt_number
    job_state state
    timestamp started_at
    timestamp finished_at
    text error
  }
  JOB_LOGS {
    uuid id PK
    uuid job_id FK
    uuid execution_id FK
    text worker_id FK
    text level
    text message
    jsonb metadata
  }
  JOB_TRANSITIONS {
    uuid id PK
    uuid job_id FK
    job_state from_state
    job_state to_state
    text worker_id
    text reason
    jsonb metadata
  }
  DEAD_LETTER_QUEUE {
    uuid id PK
    uuid job_id UK
    uuid project_id FK
    uuid queue_id FK
    text reason
    jsonb final_payload
  }
```

## Table Notes

- `users`: primary key `id`; unique `email`; password hash uses Argon2.
- `organizations`: `owner_user_id` restricts deletion while audit data exists; `deleted_at` supports soft deletion.
- `organization_members`: composite primary key prevents duplicate membership; cascades when a user/org is removed.
- `projects`: belongs to an organization; project deletion is soft-delete to preserve job audit data.
- `retry_policies`: referenced by queues; restricted deletion so historical queue configuration is not orphaned.
- `queues`: belongs to a project and retry policy; soft-delete; indexed by `project_id`, `paused`, and `priority`.
- `scheduled_jobs`: stores cron definitions separately from generated `jobs`; indexed by `active,next_run_at`.
- `jobs`: current job state and payload; hot claim index on `queue_id,state,scheduled_for,priority,created_at`; explorer index on `project_id,state,created_at`; partial unique idempotency key per project.
- `workers`: heartbeat state keyed by worker id; indexed by `last_heartbeat_at` for dead-worker detection.
- `job_executions`: one row per attempt; unique `job_id,attempt_number`; cascades with jobs.
- `job_logs`: per-execution log lines; indexed by `job_id,created_at`.
- `job_transitions`: append-only lifecycle history; indexed by `job_id,created_at`.
- `dead_letter_queue`: one row per terminal job failure; unique `job_id`; indexed for project/queue DLQ views.

Normalization is favored for auditability and access control. Deliberate denormalization exists on `jobs.max_attempts`, which snapshots retry behavior at job creation so future queue-policy edits do not silently change already-created work.
