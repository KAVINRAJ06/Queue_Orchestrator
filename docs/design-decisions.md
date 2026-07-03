# Design Decisions

- **PostgreSQL over a broker-only queue:** the assignment requires reconstructable lifecycle history and relational multi-tenancy. PostgreSQL gives durable state, transactions, indexes, row locks, and joins in one system. A dedicated broker could improve push-based dispatch later, but the database remains the source of truth.
- **`FOR UPDATE SKIP LOCKED` for claiming:** this is the core no-duplicate-execution mechanism. Multiple workers can race safely because only one transaction can lock and update a candidate job row.
- **Polling over push dispatch:** polling is simpler, robust under worker churn, and easy to scale horizontally. Redis pub/sub is present for future live updates, but correctness does not depend on ephemeral messages.
- **Queue-level retry policies:** retries are configured on queues and copied into job behavior via `max_attempts` at creation time. This keeps old jobs stable if queue policy changes later.
- **Separate scheduled jobs from job instances:** recurring cron definitions live in `scheduled_jobs`; each run creates a normal `jobs` row. This keeps schedule management separate from execution history.
- **Transitions, logs, and executions are separate:** transitions are structured lifecycle audit data, executions are attempt records, and logs are operator-facing output.
- **Soft deletion for tenant roots:** projects and queues include `deleted_at`; destructive cascade is avoided for audit-heavy entities. Child execution evidence remains available unless deliberately archived.
- **Redis is not the lock manager:** Redis is useful for live updates, distributed coordination, and rate-limiting extensions, but job claiming uses database locks so a Redis outage cannot create duplicate execution.
- **Simulated payload execution:** the worker runs deterministic local payloads for development. The `runPayload` boundary is intentionally small so real side-effect handlers can be plugged in with idempotency keys.
- **Dashboard polling fallback:** the dashboard uses polling through TanStack Query. WebSockets can be added using Redis pub/sub events without changing the API contracts or database schema.
