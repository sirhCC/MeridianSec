# Secrets Canary (MVP Skeleton)

Early warning & high-signal detection for secret exfiltration using planted canary credentials.

## Current Status

Phase 1 complete: core repositories, service layer, REST create/get/list, CLI API toggle, tests & coverage (>80%).

### REST API (Experimental)

Base URL: `http://localhost:3000`

| Method | Path                        | Description                     | Body (JSON)                                          |
| ------ | --------------------------- | ------------------------------- | ---------------------------------------------------- |
| GET    | /healthz                    | Health probe                    | -                                                    |
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

| Task              | Command                                  |
| ----------------- | ---------------------------------------- |
| Lint              | `npm run lint`                           |
| Auto-fix lint     | `npm run lint:fix`                       |
| Typecheck         | `npm run typecheck`                      |
| Build             | `npm run build`                          |
| Format (Prettier) | `npm run format`                         |
| Regenerate Prisma | `npx prisma generate`                    |
| New migration     | `npx prisma migrate dev --name <change>` |

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

Custom metric inventory:

| Name                                 | Type      | Labels                   | Description                                                                                    |
| ------------------------------------ | --------- | ------------------------ | ---------------------------------------------------------------------------------------------- |
| `detections_total`                   | Counter   | `source`                 | Total detections processed by source (SIM / CLOUDTRAIL / MANUAL).                              |
| `detection_pipeline_latency_seconds` | Histogram | (none)                   | End-to-end persistence latency for a detection (seconds). Buckets: 0.01,0.05,0.1,0.25,0.5,1,2. |
| `alerts_sent_total`                  | Counter   | `adapter`                | Successful alerts sent (StdoutAlertChannel, WebhookAlertChannel, etc).                         |
| `alert_failures_total`               | Counter   | `adapter`                | Alerts that exhausted retries and failed.                                                      |
| `rotations_total`                    | Counter   | (none)                   | Secret rotations performed.                                                                    |
| `integrity_verifications_total`      | Counter   | `result` (valid/invalid) | Hash-chain integrity verification endpoint calls by outcome.                                   |

Environment variables impacting metrics emission:

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

#### Alerting & Signature Notes

When `ALERT_HMAC_SECRET` is set, webhook alerts include `x-canary-signature` (HMAC SHA-256 hex) over a canonical JSON serialization (sorted keys recursively). This can be validated downstream to ensure integrity & authenticity of alert payloads.

Recommended downstream validation pseudocode:

```ts
const expected = hmac(secret, canonicalize(body));
if (headerSig !== expected) reject();
```

Future ideas (not yet implemented):

- Counter for alert retries.
- Reason label on `alert_failures_total` (e.g., network, 5xx, timeout).
- Histogram on rotation latency.
- Gauge for last successful poll tick timestamp.

### Troubleshooting

- If pre-commit fails on ESLint unresolved imports: current config temporarily disables strict import resolution; ensure dependencies installed.
- Delete `node_modules` + `npm install` if Prisma client mismatch occurs.
- Windows PowerShell: remember to prefix env vars with `$env:`.

### Roadmap Snapshot

Next: Phase 2 detection engine & mock alerts (see `BUILD_PHASE_PLAN.md`).

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
