# Secrets Canary & Exfiltration Early-Warning Service

> Internal build playbook (authoritative). Follow sections in order. Keep this up to date as code lands. Treat as living architecture + task board seed.

## 1. Vision & Elevator Pitch
Early detection of credential leakage and illicit secret usage by deploying **canary secrets** (decoy credentials + honeytokens) across source, CI/CD, runtime, and data stores, then monitoring for any *attempted use* or *exfiltration path indicators*. When a canary secret is touched, we raise high‑fidelity alerts (pager / chat) within seconds, with full provenance and automated containment suggestions.

## 2. Core Principles

- High signal / low noise – any alert should be near actionable certainty.
- Immutable event trail – append-only, tamper‑evident store of detections.
- Simple deploy & rollback – one command bootstrap, ephemeral agents.
- Least privilege – canary secrets are tightly scoped & revocable.
- Defense in depth – multiple classes of honeytokens (API, DB, file, IAM, network beacon).
- Privacy conscious – no over-collection of user data; minimize PII.

## 3. MVP Scope (Phase 1)

1. Generate + rotate AWS IAM canary access key (no real privileges except: CloudTrail logging test action e.g. `sts:GetCallerIdentity`).
2. Implant token copies in configurable sinks (sample repo path, CI secret var, optional S3 object tag, local .env placeholder).
3. Detection: Subscribe to CloudTrail (or simulated event stream) to capture any use of the key; correlate with source implant metadata.
4. Alert pipeline: Format enriched alert -> Slack webhook + JSON to stdout.
5. CLI to manage lifecycle: `canary init`, `canary deploy`, `canary rotate`, `canary revoke`, `canary status`.
6. Persistence: Local lightweight SQLite (or better: embedded Postgres future) mapping canary_id -> placements, rotation history, fingerprint.

## 4. Phase 2 (Planned Enhancements)

- Additional honeytokens: database DSN, fake internal service API key, signed JWT with revocation check, honeyfile marker with beacon URL.
- Exfil path heuristics: Repo scan for unauthorized movement, unusual base64 bursts in commits (integrate into pre-commit hook), outbound DNS canary domain queries.
- Multi-cloud (Azure, GCP) token generators.
- Attestation: Signed provenance (Sigstore) for rotation operations.
- SOAR integration: Auto quarantine offending CI job or temporarily lock user.

## 5. High-Level Architecture

```text
+------------------+      Deploy + Metadata      +------------------+
|  CLI / API       | --------------------------> |  Control Plane   |
|  (user)          |                             |  (Core Service)  |
+------------------+                             +---------+--------+
          ^                                                 |
          | Status / Events                                  | Issue tokens / track
          |                                                  v
    +-----+------+                                  +-------+---------+
    |  Alerting  |  <---- Enriched Events ---------- | Token Registry |
    |  Adapters  |                                  | & State Store   |
    +-----+------+                                  +-------+---------+
          ^                                                  |
          | Webhooks / Chat                                   | Placement manifests
          |                                                   v
+---------+---------+    Instrumented Usage   +---------------+--------------+
|  CloudTrail / Log | ----------------------> |  Detection Engine (Stream)   |
|  Streams / Sim    |                        +---------------+--------------+
+-------------------+                                        |
                                                           Alerts
```

### Components

- CLI (Node/TS): Command layer orchestrating API calls and local dev mode.
- Control Plane Service (Fastify or NestJS): REST + internal event bus.
- Token Registry: SQLite via Prisma – tables: `canaries`, `placements`, `rotations`, `detections`.
- Detection Engine: Stream consumer (poll CloudTrail or mock). Pattern match + enrichment.
- Alert Dispatcher: Pluggable adapters (Slack, Email, PagerDuty, Webhook, Console, TestInbox).
- Crypto Utilities: Key fingerprinting, HMAC signing of event payloads.

## 6. Data Model (Initial)

Tables (Prisma schema excerpt planned):

- canaries(id, type(enum: AWS_IAM_KEY|FAKE_API_KEY|DB_DSN), active, current_secret_hash, created_at)
- placements(id, canary_id FK, location_type(enum: REPO_FILE|CI_VAR|S3_OBJECT|ENV_FILE), location_ref, inserted_at)
- rotations(id, canary_id FK, old_secret_hash, new_secret_hash, rotated_at, rotated_by)
- detections(id, canary_id FK, detection_time, source(enum: CLOUDTRAIL|SIM|MANUAL), raw_event_json, actor_identity, confidence_score, alert_sent(bool), hash_chain_prev, hash_chain_curr)

Hash chain provides tamper-evidence for detection log (each record: SHA256(prev_hash + canonical_json)).

## 7. API Endpoints (MVP)

- POST /canaries {type} -> {id, initialPlacements[]}
- POST /canaries/:id/rotate -> rotation record
- POST /canaries/:id/revoke -> marks inactive
- GET /canaries/:id -> detail + placements + last detection
- GET /detections?since=ts -> list
- POST /simulate/detection {canary_id, actor?} (dev/testing only)

Auth: Initially local dev token via env; future: OIDC / API keys.

## 8. CLI Commands (Mapping)

- `canary init` -> bootstrap db, config file.
- `canary create --type aws-iam --placement repo:README.md --placement env:.env.local`
- `canary rotate <id>`
- `canary revoke <id>`
- `canary simulate <id>`
- `canary status <id>`
- `canary list` (summary)

## 9. Configuration

`canary.config.json` (or YAML):

```json
{
  "database": { "provider": "sqlite", "url": "file:./data/canary.db" },
  "alerting": { "slackWebhook": "${SLACK_WEBHOOK_URL}", "webhookSignatureSecret": "${ALERT_SIGNING_KEY}" },
  "cloudtrail": { "mode": "mock", "pollIntervalMs": 5000 },
  "logging": { "level": "info", "json": true }
}
```

## 10. Detection Flow (AWS IAM Key)

1. Key issued (minimal perms) & stored hashed.
2. Placements created – actual key value embedded in target files with markers: `# CANARY: <key_id>`.
3. Detection engine polls CloudTrail (or mock JSON feed) for any `AccessKeyId == canary` events.
4. On match: build detection record, compute hash_chain_curr, persist.
5. Enrichment: fetch placement list, compute confidence (100 if exact key usage), sign payload.
6. Dispatch to alert adapters concurrently with retry/backoff.

## 11. Security Considerations

- Avoid real privileges: use stub IAM policy with only `sts:GetCallerIdentity`.
- Ensure canary keys are tagged for rapid revocation.
- Encrypt at rest? (Later: KMS for secret archival; initial: hashed with salt).
- Secure hashing: `hash = SHA256(salt + secret)`, salt per canary stored.
- Signed outgoing alerts (HMAC-SHA256 over canonical JSON) to prevent spoofing.
- Rate limit simulate endpoint.

## 12. Observability

- Structured logs (pino) with trace ids.
- Metrics: Prometheus export (detections_total, alert_failures_total, detection_latency_seconds_histogram, rotations_total).
- Health endpoint: `/healthz` (db + detection loop status snapshot).

## 13. Testing Strategy

Test pyramid:

- Unit: pure funcs (hash chain, config load, CloudTrail parser).
- Integration: API endpoints with ephemeral SQLite (using `:memory:`).
- E2E: Simulate key creation -> simulated detection -> alert capture (test adapter).
- Security tests: Ensure permutations (modified event) fails signature verification.
- Property tests: Hash chain uniqueness.

Tooling: Vitest (fast TS), supertest (API), testcontainers (future for Postgres), nyc/coverage gating (>=90% lines core libs).

## 14. Performance & Scale (Targets)

- MVP comfortable at <= 50 canaries & <= 1 event/sec poll.
- Scale path: switch to streaming (Kinesis / SQS) consumer; detach detection workers horizontally.
- Optimize using incremental poll watermark (last event ID / timestamp).

## 15. Failure & Resilience

- Detection loop crash: supervised by lightweight internal watchdog (periodic heartbeat check -> restart or alert).
- Alert adapter failure: queue & retry with exponential backoff (max retry 5, then dead-letter table).
- DB corruption: snapshot export command (Phase 2) + WAL backups.

## 16. Directory Structure (Planned)

```text
/ (repo root)
  INSTRUCTION.md
  package.json
  tsconfig.json
  prisma/
    schema.prisma
  src/
    index.ts
    config/
    core/ (domain services)
    adapters/ (alerting, cloudtrail, persistence)
    api/ (routes)
    cli/
    detection/
    utils/
  tests/
    unit/
    integration/
    e2e/
  .github/workflows/
    ci.yml
    release.yml
    codeql.yml
```

## 17. GitHub Workflows (Design)

### ci.yml

Triggers: PR + push (main). Jobs:

1. Setup (cache pnpm/npm), install deps.
2. Lint (ESLint) + Type check (tsc --noEmit).
3. Unit & Integration tests (Vitest) with coverage upload (Codecov optional).
4. Build (tsc) ensure output.
5. Security: `npm audit --audit-level=high` (non-blocking warn) + `trivy fs .` (future optional step).

### release.yml

Triggers: Tag `v*.*.*`.

Jobs:

- Build & package (compile to dist/ + generate SBOM using `cyclonedx-npm`).
- Create GitHub Release (attach artifacts: dist.zip, SBOM.xml, coverage summary).
- Publish Docker image (`ghcr.io/<org>/secrets-canary:<tag>`).

### codeql.yml

Standard CodeQL analysis for JavaScript/TypeScript on PR + weekly cron.

### rotate-canaries.yml (Later)

Scheduled daily. Runs CLI `canary rotate --stale-days 30`.

## 18. Dependency Choices

- Runtime: Node 20 LTS, TypeScript.
- Web framework: Fastify (perf + schema validation) or NestJS (if opinionated). MVP: Fastify.
- ORM: Prisma (SQLite now, Postgres later).
- Logging: pino.
- CLI: commander (or clipanion). MVP: commander.
- Testing: Vitest + supertest.
- Hashing: crypto (native), optional libsodium (future).
- Alerting: axios (HTTP), slack sdk (maybe later) minimal first.

## 19. Coding Standards

- Strict TS (`strict: true`), no implicit any, no default export (prefer named).
- ESLint + Prettier (conflict-free), commitlint (conventional commits), husky pre-commit: lint-staged. (Can add gradually.)

## 20. Development Milestones

Outlined in Sections 21 (Task Backlog) and 24 (Definition of Done). This section intentionally references those lists; expand with timeline as milestones complete.
Milestone 1 (MVP skeleton): config loader, prisma schema, migration, HTTP server health, CLI init, base test harness.
Milestone 2: Create canary (AWS key placeholder w/ mock secret), placements, detection simulate endpoint, alert adapter (console + test), unit tests.
Milestone 3: Real AWS integration toggle (optional), Slack adapter, rotation logic, hash chain.
Milestone 4: Harden (signature, retries, metrics), CI polishing, release workflow.
Milestone 5: Additional token types & docs site generation (typedoc).

## 21. Initial Task Backlog (Actionable)

- [ ] Scaffold package.json, tsconfig, eslint.
- [ ] Add prisma schema & first migration.
- [ ] Implement config module (env + file merge) with schema validation (zod).
- [ ] Implement logging utility wrapper.
- [ ] Implement domain models (TypeScript types/interfaces).
- [ ] HTTP server bootstrap with Fastify + /healthz.
- [ ] CLI `init` (creates db, config skeleton).
- [ ] CLI `create` (mock canary + placement record).
- [ ] Detection engine (mock poller) + simulate endpoint.
- [ ] Alert dispatcher (console).
- [ ] Hash chain util + tests.
- [ ] Slack adapter + tests (env-driven enable).
- [ ] Rotation logic + CLI command.
- [ ] Integration tests for life-cycle.
- [ ] GitHub workflows (ci.yml, codeql.yml, release.yml stub).

## 22. Threat Modeling (High-Level)

Attack Surfaces:

- Control Plane API: Input validation, rate limiting (later), auth token secret.
- CLI config tampering: Sign migrations? (future) – store checksum of config.
- Alert spoofing: HMAC signed payloads.
- Secret leakage: Avoid printing actual secret once generated; store only hash.

## 23. Open Questions

- Do we need Postgres now? (Defer until > concurrency needs / multi-instance.)
- Should we integrate real AWS creation in MVP or mock first? (Plan: mock first.)
- Namespace for package? (@meridiansec/secrets-canary ?) – decide before publish.

## 24. Definition of Done (MVP)

- All Milestone 1 & 2 tasks complete.
- 85%+ coverage core modules.
- CI green (lint, typecheck, tests) on main.
- README with quickstart & architecture diagram.
- At least one simulated detection produces Slack alert (optional if webhook configured) or console fallback.

## 25. Quick Start (Future README Excerpt Draft)

```bash
# install deps
yarn install
# init local env (creates db, config)
yarn canary init
# create a mock canary
yarn canary create --type aws-iam --placement repo:README.md
# run detection engine
yarn start:detection
# simulate usage
yarn canary simulate <id>
```

---
Maintainer Note: Keep this INSTRUCTION.md synchronized with actual implementation. Update sections (17, 21) as workflows & tasks evolve.
