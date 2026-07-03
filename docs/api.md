# API Documentation

Base URL: `http://localhost:4000/api`

Authentication uses `Authorization: Bearer <token>`. Every response includes `x-request-id`; structured errors return `error.code`, `error.message`, optional `error.details`, and `error.requestId`.

Swagger UI is served at `http://localhost:4000/docs`.

## Auth

- `POST /auth/signup` `{ email, password, name? }`
- `POST /auth/login` `{ email, password }`
- `GET /auth/me`

## Projects

- `GET /projects`
- `POST /projects` `{ organizationId?, name }`

## Queues

- `GET /queues?projectId=<uuid>`
- `POST /queues`
- `PATCH /queues/:id`
- `POST /queues/:id/pause`
- `POST /queues/:id/resume`

Queue body:

```json
{
  "projectId": "uuid",
  "name": "default",
  "priority": 50,
  "concurrencyLimit": 4,
  "retryPolicy": {
    "strategy": "exponential",
    "maxAttempts": 3,
    "delayMs": 5000,
    "multiplier": 2,
    "maxDelayMs": 60000
  }
}
```

## Jobs

- `GET /jobs?projectId=<uuid>&queueId=<uuid>&state=queued&page=0&limit=20`
- `POST /jobs`
- `GET /jobs/:id`
- `GET /jobs/:id/executions`
- `GET /jobs/:id/logs`
- `GET /jobs/:id/timeline`
- `POST /jobs/:id/retry`
- `GET /jobs/batches/:batchId/status`
- `GET /jobs/schedules/recurring`
- `GET /jobs/dead-letter`
- `POST /jobs/dead-letter/:jobId/requeue`
- `POST /jobs/claim/next`

Immediate job:

```json
{
  "projectId": "uuid",
  "queueId": "uuid",
  "name": "Send webhook",
  "type": "immediate",
  "priority": 50,
  "payload": { "ms": 1200 }
}
```

Delayed job:

```json
{
  "projectId": "uuid",
  "queueId": "uuid",
  "name": "Send later",
  "type": "delayed",
  "delayMs": 10000,
  "payload": {}
}
```

Batch job:

```json
{
  "projectId": "uuid",
  "queueId": "uuid",
  "name": "Import row",
  "type": "batch",
  "batch": [{ "row": 1 }, { "row": 2 }]
}
```

Recurring schedule:

```json
{
  "projectId": "uuid",
  "queueId": "uuid",
  "name": "Nightly report",
  "type": "cron",
  "cronExpression": "0 2 * * *",
  "payload": { "ms": 500 }
}
```

## Workers And Metrics

- `GET /workers`
- `GET /metrics?projectId=<uuid>`
- `GET /metrics/prometheus`
