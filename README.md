# Queue Orchestrator

Production-inspired distributed job scheduling platform for running asynchronous background jobs across horizontally scalable workers. The system is split into an API server, worker service, React dashboard, PostgreSQL, and Redis.

## Deliverables

- Source code with setup instructions: `backend/`, `frontend/`, this README, and `docker-compose.yml`
- Architecture diagram: [docs/architecture.md](docs/architecture.md)
- ER diagram: [docs/er-diagram.md](docs/er-diagram.md)
- API documentation: generated Swagger UI at `http://localhost:4000/docs` and [docs/api.md](docs/api.md)
- Design decisions document: [docs/design-decisions.md](docs/design-decisions.md)
- Automated tests for critical functionality: `backend/tests` covers retry/backoff, DLQ planning, and atomic claim SQL guarantees

## Stack

- Backend: TypeScript, Node.js LTS, Fastify, Knex, PostgreSQL
- Worker: TypeScript process using the same PostgreSQL schema and `SELECT ... FOR UPDATE SKIP LOCKED`
- Coordination: Redis for pub/sub readiness and future live event fan-out; PostgreSQL row locks are the source of truth for claims
- Frontend: React, TypeScript, Vite/TanStack Start, TanStack Query, shadcn-style components, Recharts
- Auth: JWT access/refresh tokens and Argon2 password hashing
- Tests: Vitest plus focused reliability unit tests
- Runtime: Docker Compose for API, worker, frontend, Postgres, Redis

## One-Command Setup

```bash
docker compose up --build
```

Open:

- Dashboard: [http://localhost:5173](http://localhost:5173)
- API health: [http://localhost:4000/health](http://localhost:4000/health)
- Swagger docs: [http://localhost:4000/docs](http://localhost:4000/docs)

Scale workers:

```bash
docker compose up --scale worker=3
```

## Local Development

Backend:

```bash
cd backend
npm install
$env:DATABASE_URL="postgres://postgres:postgres@localhost:5432/queue_orchestrator"
$env:REDIS_URL="redis://localhost:6379"
npm run migrate
npm run dev
```

Worker:

```bash
cd backend
npm run worker
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Tests:

```bash
cd backend
npm test
```

## Reliability Guarantees

- No duplicate execution: workers claim jobs with PostgreSQL row-level locks and `FOR UPDATE SKIP LOCKED`.
- Queue concurrency: each claim checks active `claimed` and `running` jobs against the queue limit.
- Crash recovery: stale worker/job heartbeats requeue claimed or running jobs.
- Retry policy: fixed, linear, or exponential backoff with max attempts and delay caps.
- Dead Letter Queue: exhausted jobs move to `dead_letter_queue` and can be manually requeued.
- Auditability: every lifecycle transition is stored in `job_transitions`; attempts are stored in `job_executions`; logs are stored in `job_logs`.

## Queue Settings

The dashboard queue settings modal edits the same production queue configuration used by the worker:

- `priority`: numeric polling priority; higher values are claimed first.
- `concurrencyLimit`: maximum active jobs for the queue.
- `retryPolicy.strategy`: fixed, linear, or exponential backoff.
- `retryPolicy.maxAttempts`, `delayMs`, and `maxDelayMs`: retry attempt and delay controls.

## Job Lifecycle

```text
Queued -> Scheduled -> Claimed -> Running -> Completed
                           |
                           v
                        Failed -> Retrying -> Queued/Scheduled
                           |
                           v
                    Dead Letter Queue
```

## Useful API Examples

Create an immediate job:

```json
{
  "projectId": "project-uuid",
  "queueId": "queue-uuid",
  "name": "Send webhook",
  "type": "immediate",
  "priority": 50,
  "payload": { "ms": 1200, "failRate": 0.2 }
}
```

Create a cron schedule:

```json
{
  "projectId": "project-uuid",
  "queueId": "queue-uuid",
  "name": "Nightly report",
  "type": "cron",
  "cronExpression": "0 2 * * *",
  "payload": { "ms": 500 }
}
```

The worker executes simulated payloads so the project stays self-contained:

```json
{
  "ms": 1200,
  "fail": false,
  "failRate": 0.25,
  "errorMessage": "Simulated worker failure"
}
```

## Project Structure

```text
backend/
  migrations/        PostgreSQL schema
  src/app.ts         Fastify app and Swagger
  src/routes/        Auth, projects, queues, jobs, workers, metrics
  src/services/      Scheduler, retry, DLQ planning
  src/worker/        Horizontally scalable worker process
  tests/             Reliability-critical tests
frontend/
  src/components/    Dashboard views and queue settings UI
docs/
  architecture.md    Component/data-flow diagram
  er-diagram.md      Relational schema diagram and table notes
  api.md             REST API documentation
  design-decisions.md
```

## Environment Variables

```text
PORT=4000
DATABASE_URL=postgres://postgres:postgres@localhost:5432/queue_orchestrator
REDIS_URL=redis://localhost:6379
JWT_SECRET=change-me
CORS_ORIGIN=http://localhost:5173
WORKER_CONCURRENCY=4
POLL_INTERVAL_MS=1000
HEARTBEAT_INTERVAL_MS=5000
JOB_LEASE_MS=30000
STALE_WORKER_MS=45000
```
