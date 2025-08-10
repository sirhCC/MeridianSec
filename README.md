# Secrets Canary (MVP Skeleton)

Early warning & high-signal detection for secret exfiltration using planted (decoy) credentials, with integrity‑preserving hash chaining, alert fan‑out, and deep observability (metrics, structured logs w/ correlation IDs, enriched health snapshot).

## Current Status

Phase 5 complete; Phase 6 hardening in progress with persistent alert dead-letter queue (DLQ) + replay CLI & replay metrics: CRUD + rotations, detection engine, chain integrity verify, Prometheus metrics, alerting (stdout + optional webhook w/ HMAC signature), persisted alert failures, replay tooling (success/failure counters + latency histogram), per‑detection correlation IDs, enriched `/healthz`, >85% coverage.

### REST API (Experimental)

Base URL: `http://localhost:3000`

| Method | Path                        | Description                     | Body (JSON)                                          |
| ------ | --------------------------- | ------------------------------- | ---------------------------------------------------- |
| GET    | /healthz                    | Health probe (enriched)         | -                                                    |
| POST   | /v1/canaries                | Create canary + placements      | {type, currentSecretHash, salt, placements?}         |
| GET    | /v1/canaries                | List canaries                   | -                                                    |
| GET    | /v1/canaries/:id            | Get canary + placements         | -                                                    |
| POST   | /v1/simulate/detection      | Simulate detection event        | {canaryId, source?, rawEventJson?, confidenceScore?} |
| GET    | /v1/canaries/:id/detections | List detections (chronological) | -                                                    |

Create body example:

```json
{
  "type": "AWS_IAM_KEY",
  "currentSecretHash": "<sha256-or-derived-hash>",
  "salt": "<random-salt>",
  "placements": [{ "locationType": "REPO_FILE", "locationRef": "README.md" }]
}
```

Response (201):

```json
{
  "canary": {
    "id": "ck...",
    "type": "AWS_IAM_KEY",
    "active": true,
    "createdAt": "2025-08-09T00:00:00.000Z"
  },
  "placements": [
    {
      "id": "ck...",
      "canaryId": "ck...",
      "locationType": "REPO_FILE",
      "locationRef": "README.md",
      "insertedAt": "2025-08-09T00:00:00.000Z"
    }
  ]
}
```

Error format:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "..." } }
```

Detection simulation example:

```powershell
curl -X POST http://localhost:3000/v1/simulate/detection -H "Content-Type: application/json" -d '{"canaryId":"<id>","source":"SIM"}'
```

## Quick Start (Local Dev)

### Prerequisites

- Node.js 20+
- Git
- (Optional) SQLite browser for inspection

### 1. Clone & Install

```powershell
git clone https://github.com/sirhCC/MeridianSec.git
cd MeridianSec
npm install
```

### 2. Environment

An SQLite database file is defaulted (`file:./data/canary.db`). Override if desired:

```powershell
$env:DATABASE_URL = "file:./data/canary.db"
```

### 3. Generate Prisma Client / Migrate

```powershell
npx prisma migrate dev --name init
```

### 4. Run API Server

```powershell
npm run dev
# New terminal
curl http://localhost:3000/healthz
```

### 5. Use CLI (Mock Canary)

```powershell
npm run canary -- create --type aws-iam --placement repo:README.md

# Or via API mode (server must be running):
$env:USE_API=1; npm run canary -- create --type aws-iam --placement repo:README.md
```

### 6. Tests & Coverage

```powershell
npm test
```

Coverage thresholds enforced (initial Phase 0 gate 60%).

### 7. Common Tasks

| Task                  | Command                                      |
| --------------------- | -------------------------------------------- |
| Lint                  | `npm run lint`                               |
| Auto-fix lint         | `npm run lint:fix`                           |
| Typecheck             | `npm run typecheck`                          |
| Build                 | `npm run build`                              |
| Format (Prettier)     | `npm run format`                             |
| Regenerate Prisma     | `npx prisma generate`                        |
| New migration         | `npx prisma migrate dev --name <change>`     |
| List alert failures   | `npm run canary -- replay-failures`          |
| Replay alert failures | `npm run canary -- replay-failures --replay` |
| Purge alert failures  | `npm run canary -- purge-failures --dry-run` |

### Build/Test Metrics (Phase 0 Baseline + Phase 1)

| Metric                      | Value (Local) |
| --------------------------- | ------------- |
| Build Time                  | ~1.35s        |
| Test Time                   | ~1.45s        |
| Coverage (Phase 0 baseline) | 100% lines\*  |
| Coverage (Phase 1 current)  | ~83% lines    |

`*` Phase 0 gate requires >=60%; higher now for headroom.

### Operational Metrics (Prometheus)

The service exposes a Prometheus text endpoint at `GET /metrics` (default Fastify listen address / port you configure). It includes both default `prom-client` process metrics and custom domain metrics.

Custom metric inventory (current):

| Name                                 | Type      | Labels                   | Description                                                                                    |
| ------------------------------------ | --------- | ------------------------ | ---------------------------------------------------------------------------------------------- |
| `detections_total`                   | Counter   | `source`                 | Total detections processed by source (SIM / CLOUDTRAIL / MANUAL).                              |
| `detection_pipeline_latency_seconds` | Histogram | (none)                   | End-to-end persistence latency for a detection (seconds). Buckets: 0.01,0.05,0.1,0.25,0.5,1,2. |
| `alerts_sent_total`                  | Counter   | `adapter`,`status`       | Successful alerts sent (status currently always 'sent').                                       |
| `alert_failures_total`               | Counter   | `adapter`,`reason`       | Alerts that exhausted retries and failed (reason = error name).                                |
| `alert_replays_total`                | Counter   | `result`                 | Replay attempts of DLQ alert failures (result=success or failure).                             |
| `alert_replay_latency_ms`            | Histogram | (none)                   | Latency of replayed alert attempt in milliseconds.                                             |
| `alert_failures_purged_total`        | Counter   | mode                     | DLQ purge operations (values: dry_run, deleted).                                               |
| `rotations_total`                    | Counter   | (none)                   | Secret rotations performed.                                                                    |
| `integrity_verifications_total`      | Counter   | `result` (valid/invalid) | Hash-chain integrity verification endpoint calls by outcome.                                   |
| `integrity_failures_total`           | Counter   | `reason`                 | Integrity verification failures (PREV_MISMATCH or CURR_MISMATCH).                              |

Replay attempts are tracked via `alert_replays_total` and `alert_replay_latency_ms` (success/failure + latency).

Environment variables impacting metrics & alert flow:

| Variable            | Purpose                                                                                 |
| ------------------- | --------------------------------------------------------------------------------------- |
| `ALERT_THRESHOLD`   | Enables alerting & metrics for alerts if set.                                           |
| `ALERT_WEBHOOK_URL` | Adds webhook channel producing alert counters.                                          |
| `ALERT_HMAC_SECRET` | Enables HMAC signing header (`x-canary-signature`) on webhook and still counts metrics. |

#### Prometheus Scrape Config Example

```yaml
scrape_configs:
  - job_name: 'canary-service'
    scrape_interval: 15s
    static_configs:
      - targets: ['canary:3000'] # replace host:port
```

If you run locally without Docker compose networking, target might be `['localhost:3000']`.

#### Sample Grafana Queries

Detection throughput (per source, 5m rate):

```promql
sum by (source) (rate(detections_total[5m]))
```

Alert failure ratio (5m):

```promql
sum(rate(alert_failures_total[5m])) / clamp_min(sum(rate(alerts_sent_total[5m])), 1)
```

95th percentile detection latency:

```promql
histogram_quantile(0.95, sum(rate(detection_pipeline_latency_seconds_bucket[5m])) by (le))
```

Rotations per day (last 24h):

```promql
increase(rotations_total[24h])
```

Integrity verification invalid ratio (1h):

```promql
sum(increase(integrity_verifications_total{result="invalid"}[1h])) / clamp_min(sum(increase(integrity_verifications_total[1h])),1)
```

Alerts sent by adapter (stacked):

```promql
sum by (adapter) (rate(alerts_sent_total[5m]))
```

Suggested Grafana panels:

1. Stat: Total detections (sum(detections_total)).
2. Time-series: Detection rate by source.
3. Time-series: 95th latency (histogram_quantile above).
4. Bar: Alerts sent per adapter (short range rate).
5. Gauge: Alert failure ratio (query above \* 100).
6. Stat: Rotations in last 24h (increase(rotations_total[24h])).
7. Pie / Bar: Integrity verifications result breakdown (increase over 1h by label).

#### Local Curl Example

```powershell
curl http://localhost:3000/metrics | Select-String detections_total
```

#### Alerting, Signatures & Correlation IDs

When `ALERT_HMAC_SECRET` is set, webhook alerts include `x-canary-signature` (HMAC SHA-256 hex) over a canonical JSON serialization (sorted keys recursively). This is used to verify downstream integrity & authenticity.

Alert payload (core fields):

```jsonc
{
  "canaryId": "...",
  "detectionId": "...",
  "correlationId": "<uuid-v4>",
  "confidenceScore": 75,
  "source": "SIM",
  "hash": "<hash-chain-curr>",
  "createdAt": "2025-08-09T12:34:56.789Z",
  "message": "Detection <id> (canary <id>) score 75 >= 70",
}
```

Use `correlationId` to tie together:

- Detection ingestion log: `msg":"canary-detection"`
- Alert emission log: `msg":"detection-alert"`
- Internal alert metrics summary: `msg":"alert-metrics"`

Recommended downstream validation pseudocode:

```ts
const expected = hmac(secret, canonicalize(body));
if (headerSig !== expected) reject();
```

### Dead-Letter Queue (Alert Failures) & Replay

When an alert channel (e.g. webhook) exhausts retries, the final failure is persisted in the `AlertFailure` table:

```jsonc
{
  "id": "...",
  "detectionId": "...",
  "canaryId": "...",
  "adapter": "WebhookAlertChannel",
  "reason": "Error",
  "attempts": 3,
  "lastError": "webhook responded 500",
  "createdAt": "...",
  "replayedAt": null,
  "replaySuccess": null,
}
```

CLI usage:

List failures (JSON per line):

```powershell
npm run canary -- replay-failures -l 20
```

Replay after fixing downstream (e.g. webhook now returns 2xx):

```powershell
$env:ALERT_THRESHOLD = 10
$env:ALERT_WEBHOOK_URL = "https://example.com/fixed-endpoint"
npm run canary -- replay-failures --replay
```

Each replay updates `replayedAt` + `replaySuccess`. Replay uses the same threshold + signing secret logic as live alerts. Replay attempts are instrumented via `alert_replays_total{result="success|failure"}` and latency histogram `alert_replay_latency_ms` (milliseconds from attempt start to completion).

Replay command exit codes:

| Exit Code | Meaning                                                                                                |
| --------- | ------------------------------------------------------------------------------------------------------ |
| 0         | Listed failures (no replay) OR replay completed and all succeeded OR no failures found                 |
| 1         | Configuration / runtime error (e.g. alerting disabled while --replay specified, API/validation errors) |
| 2         | Replay executed and at least one failure replay attempt failed (partial success)                       |

Operational tips:

- Monitor backlog size; investigate repeated failures quickly.
- Consider scheduled job (future) to export & purge resolved entries.
- Use `purge-failures` to enforce retention (e.g. delete >30d old, only replayed entries). Example dry-run:

```powershell
npm run canary -- purge-failures --older-than 45 --replayed-only --dry-run
```

Delete successfully replayed, older than 7 days:

```powershell
npm run canary -- purge-failures --older-than 7 --successful-only
```

- Treat presence of unreplayed failures as a warning indicator.

### Health Endpoint Details

`GET /healthz` returns operational snapshot:

```jsonc
{
  "status": "ok",
  "time": "2025-08-09T12:34:56.123Z",
  "build": { "version": "1.0.0", "node": "v20.11.0" },
  "canaries": { "count": 5 },
  "detections": { "processed": 42 },
  "engine": {
    "lastDetectionProcessedAt": "2025-08-09T12:34:40.900Z",
    "pollingLoopLastTick": "2025-08-09T12:34:55.500Z",
    "running": true,
  },
}
```

### Future Ideas (Backlog Excerpts)

- Rotation latency histogram.
- Poll loop last tick exported as metric (gauge). (Health includes timestamp; metric pending.)
- Alert retry counter + backoff histogram (end-to-end alert latency metric pending).
- Structured audit log export sink.
- DLQ maintenance commands (purge/export & archival policies).

### Troubleshooting

- If pre-commit fails on ESLint unresolved imports: current config temporarily disables strict import resolution; ensure dependencies installed.
- Delete `node_modules` + `npm install` if Prisma client mismatch occurs.
- Windows PowerShell: remember to prefix env vars with `$env:`.

### Roadmap Snapshot

See `BUILD_PHASE_PLAN.md` for phased roadmap & completed milestones.

## Development Workflow

1. Install deps (hooks auto-installed via husky).
2. Create feature branch `git checkout -b feature/<area>-<short-desc>`.
3. Run `npm run lint` / `npm test` locally; commit triggers pre-commit hook (lint-staged).
4. Generate migration if schema changes: `npx prisma migrate dev --name <change>`.
5. Open PR; CI must be green (lint, typecheck, tests, build).

Coverage reports generated via Vitest (V8). Thresholds enforced incrementally (see BUILD_PHASE_PLAN.md).

## Scripts

- dev: run API in ts-node/tsx
- canary: run CLI
- test: Vitest unit tests

## Next Steps

See `INSTRUCTION.md` backlog (section 21) for remaining tasks.
