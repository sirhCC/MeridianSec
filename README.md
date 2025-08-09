# Secrets Canary (MVP Skeleton)

Early warning & high-signal detection for secret exfiltration using planted canary credentials.

## Current Status

Phase 1 complete: core repositories, service layer, REST create/get/list, CLI API toggle, tests & coverage (>80%).

### REST API (Experimental)

Base URL: `http://localhost:3000`

| Method | Path                   | Description                | Body (JSON)                                          |
| ------ | ---------------------- | -------------------------- | ---------------------------------------------------- |
| GET    | /healthz               | Health probe               | -                                                    |
| POST   | /v1/canaries           | Create canary + placements | {type, currentSecretHash, salt, placements?}         |
| GET    | /v1/canaries           | List canaries              | -                                                    |
| GET    | /v1/canaries/:id       | Get canary + placements    | -                                                    |
| POST   | /v1/simulate/detection | Simulate detection event   | {canaryId, source?, rawEventJson?, confidenceScore?} |

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

### Metrics (Phase 0 Baseline + Phase 1)

| Metric                      | Value (Local) |
| --------------------------- | ------------- |
| Build Time                  | ~1.35s        |
| Test Time                   | ~1.45s        |
| Coverage (Phase 0 baseline) | 100% lines\*  |
| Coverage (Phase 1 current)  | ~83% lines    |

`*` Phase 0 gate requires >=60%; higher now for headroom.

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
