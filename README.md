# Secrets Canary (MVP Skeleton)

Early warning & high-signal detection for secret exfiltration using planted canary credentials.

## Current Status

Scaffold only: config loader, Fastify health endpoint, CLI init/create mock canary, hash chain utils, Prisma schema, unit test sample.

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

### Baseline Metrics (Phase 0)

| Metric     | Value (Local) |
| ---------- | ------------- |
| Build Time | ~1.35s        |
| Test Time  | ~1.45s        |
| Coverage   | 100% lines\*  |

`*` Phase 0 gate requires >=60%; higher now for headroom.

### Troubleshooting

- If pre-commit fails on ESLint unresolved imports: current config temporarily disables strict import resolution; ensure dependencies installed.
- Delete `node_modules` + `npm install` if Prisma client mismatch occurs.
- Windows PowerShell: remember to prefix env vars with `$env:`.

### Roadmap Snapshot

Phase 1 will introduce repository & service layers plus REST endpoints. See `BUILD_PHASE_PLAN.md` for details.

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
