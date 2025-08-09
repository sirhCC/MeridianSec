# Secrets Canary (MVP Skeleton)

Early warning & high-signal detection for secret exfiltration using planted canary credentials.

## Current Status

Scaffold only: config loader, Fastify health endpoint, CLI init/create mock canary, hash chain utils, Prisma schema, unit test sample.

## Quick Start

```bash
# Install deps
npm install
# (Optional) create env file
$env:DATABASE_URL="file:./data/canary.db"  # PowerShell example

# Generate prisma client & run migration
npx prisma migrate dev --name init

# Run dev server
npm run dev
# Test health
curl http://localhost:3000/healthz

# CLI: create mock canary
npm run canary -- create --type aws-iam --placement repo:README.md
```

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
