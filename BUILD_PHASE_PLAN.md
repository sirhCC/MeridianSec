## Secrets Canary Project Phased Delivery Plan

> Living document. Use alongside `INSTRUCTION.md`. Update at phase boundaries and when scope shifts. Each phase ends with explicit acceptance criteria & quality gates.

### Legend / Conventions

- Status Tags: `[PENDING]`, `[IN PROGRESS]`, `[BLOCKED]`, `[DONE]`
- Effort Buckets: XS (<0.5d), S (0.5–1d), M (1–2d), L (2–4d), XL (>1wk)
- Roles (initially one person may cover multiple): ARCH (Architecture), BE (Backend), SEC (Security), REL (Release/CI), QA (Testing), DOC (Documentation)
- DRIs named when assigned (e.g., `@chris`).

### High-Level Phase Overview

| Phase | Objective                    | Core Outputs                                | Primary Risks              | Exit Metric Snapshot                     |
| ----- | ---------------------------- | ------------------------------------------- | -------------------------- | ---------------------------------------- |
| 0     | Foundation Hardening         | Toolchain, schema baseline, repo hygiene    | Config drift               | Build + lint + unit test green           |
| 1     | Core Domain & API Skeleton   | CRUD for canaries, placements               | Data model churn           | 70% unit coverage core utils             |
| 2     | Detection & Alerts (Mock)    | Detection loop + console alerts             | Race conditions hash chain | E2E simulate path <2s                    |
| 3     | Rotation & Integrity         | Rotation CLI + hash chain verification      | Tamper/ordering issues     | Hash chain verifies 100%                 |
| 4     | Slack + Signing + Retry      | Slack adapter, HMAC signing, retry DLQ      | Alert noise / secrets      | <1% alert failure (test env)             |
| 5     | Metrics & Observability      | Prometheus metrics, structured context logs | Overhead                   | p95 detection latency tracked            |
| 6     | Hardening & CI Quality Gates | Coverage gate, CodeQL, release artifacts    | False positives block CI   | Coverage >=85%                           |
| 7     | Extensibility Tokens v2      | Additional token type + strategy pattern    | Abstraction leak           | New token no code churn outside strategy |
| 8     | Pre-Prod Stabilization       | Load/persistence resilience, docs           | SQLite lock contention     | Zero data loss under test load           |
| 9     | Optional Cloud Integration   | Real AWS key creation toggle                | Credential misuse risk     | Successful dry‑run rotation in sandbox   |

---

## Phase 0 – Foundation Hardening (Current: partially done)

**Goal:** Ensure a solid, reproducible, enforceable baseline before scaling features.

Tasks

1. [DONE] Node 20 engines & `.npmrc` engine-strict.
2. [DONE] TypeScript strict config (NodeNext).
3. [DONE] ESLint + Prettier + rules (no implicit any, formatting).
4. [DONE] Prisma schema baseline (string enums for SQLite).
5. [DONE] Basic Fastify server `/healthz`.
6. [DONE] CLI `init` + `create` (mock).
7. [DONE] Hash chain util + unit test.
8. [DONE] Add lint:fix script & enforce commit hooks (husky + lint-staged) (S).
9. [DONE] Add coverage threshold gate (initial 60%) (XS).
10. [DONE] Document local dev workflow in README quick start (XS).

Quality Gates / Exit Criteria

- CI passes: lint, typecheck, unit tests.
- Coverage >= 60% (core utils + config).
- README quick start validated via a clean clone dry run.

Metrics (baseline captured at end of phase):

- Build time, test time, baseline coverage.

Risks & Mitigations

- Drift between schema & domain types → Add repository layer abstraction in Phase 1.

---

## Phase 1 – Core Domain & API Skeleton

**Goal:** Formalize domain boundaries and expose minimal REST endpoints enabling integration tests.

Deliverables

- Repository layer (`/src/persistence/*` or `/src/adapters/db/*`).
- Domain services: `CanaryService` (create/list/get), `PlacementService` (list by canary).
- REST Endpoints:
  - POST `/v1/canaries` (mock create)
  - GET `/v1/canaries/:id`
  - GET `/v1/canaries`
- Error handling middleware (uniform JSON: `{error: {code, message, details?}}`).
- Validation via Zod schemas for request/response.
- Integration tests with in-memory / temp db (or separate SQLite file).
- CLI optionally refactored to call API (feature flag `USE_API=1`).

Tasks (Ordered)

1. Add repository abstraction (M).
2. Implement service layer (S).
3. Add request/response schemas (XS each).
4. Implement endpoints + Fastify route registration (S).
5. Write integration tests (create + get + list) (M).
6. CLI refactor (toggle) (M, optional in this phase but recommended).
7. Update README endpoints section (XS).

Acceptance Criteria

- All endpoints return 2xx for happy paths, 4xx for validation errors, 404 for unknown id.
- Integration tests green; coverage >= 70% for domain + API.
- No direct Prisma use outside repository layer (except migrations).

Risks

- Over-engineering early; keep services thin and avoid premature abstraction for detection logic.

---

## Phase 2 – Detection Engine (Mock) & Console Alerts

**Goal:** End-to-end detection pipeline from simulated event to stored detection + console alert.

Deliverables

- `DetectionEngine` service with start/stop, internal poll loop (configurable interval).
- Mock event source provider (random or queue), plus API injection endpoint POST `/v1/simulate/detection`.
- Detection record persistence (including hash chain link).
- Console alert dispatcher (structured log line `alert` level or dedicated channel).
- E2E test: create canary → simulate detection → verify detection row + console output captured (test adapter).

Tasks

1. Event bus abstraction (XS) – simple emitter.
2. Detection repository operations (XS) (fetch last hash, insert in transaction).
3. Hash chain linkage & util test for collision/tamper (S).
4. Implement poll loop (M).
5. Simulate endpoint (S).
6. Console alert adapter (XS).
7. E2E test harness (M).

Acceptance Criteria

- Simulate endpoint triggers detection < 2s median.
- Detection rows have non-null `hashChainCurr`; first row has null `hashChainPrev`.
- Console alert contains canary id + confidence score.

Risks

- Race on hash chain when simultaneous detections: mitigate via transaction & SELECT last ordered by time.

---

## Phase 3 – Rotation & Integrity Verification

**Goal:** Full lifecycle management of canary secret values with verifiable detection log integrity.

Deliverables

- Rotation service (generate new mock secret, update hash, insert rotation record).
- CLI command & API endpoint: POST `/v1/canaries/:id/rotate`.
- Integrity verifier utility scanning detections to confirm hash chain consistency.
- Scheduled integrity check (manual script/CLI initially `canary verify-chain`).
- Tests: rotation updates secret hash, integrity check passes, tampered row fails.

Tasks

1. Rotation service + test (S).
2. API route + CLI wiring (S).
3. Integrity verifier (M).
4. Tamper test (modify raw_event_json and re-run verify expecting failure) (S).
5. Documentation update (XS).

Acceptance Criteria

- Rotation log includes old & new secret hash (different).
- Verify-chain command returns success exit code; failure if manipulated test scenario.

Risks

- Forget to invalidate caches after rotation (if caching introduced later). Keep none at this phase.

---

## Phase 4 – Slack Adapter, HMAC Signing, Retry/Backoff

**Goal:** External alert delivery with authenticity & minimal retry logic.

Deliverables

- Slack adapter (webhook) guarded by config.
- HMAC signing module (canonical JSON builder + signature header `X-Canary-Signature`).
- Unified dispatcher that fans out to enabled adapters (Slack + console).
- Retry with exponential backoff (e.g., 2 attempts, delays 1s/3s) before marking failure.
- Dead-letter table or log entry for final failures.
- Tests mocking Slack endpoint (nock or manual minimal server) verifying signature & retry.

Tasks

1. Canonical JSON serializer (stable key order) (XS).
2. HMAC signer + unit test (XS).
3. Slack adapter implementation (S).
4. Dispatcher orchestrator (S).
5. Retry logic & test (M).
6. Dead-letter representation (table or JSON file) (S).
7. Integration test w/ simulated Slack failure (M).

Acceptance Criteria

- Slack message delivered in test mode with expected fields.
- On forced failure, exactly N retries happen then DLQ recorded.
- Signature matches test verification util.

Risks

- Potential secret leakage in logs. Ensure secret values never in alert payload (only IDs/fingerprints).

---

## Phase 5 – Metrics & Observability

**Goal:** Operational transparency to support scaling & future tuning.

Deliverables

- Prometheus metrics endpoint `/metrics`.
- Counters: `detections_total{source=}`, `alerts_sent_total{adapter=,status=}`, `rotations_total`.
- Histogram: `detection_pipeline_latency_seconds`.
- Health endpoint enriched: detection loop last heartbeat timestamp, queue depth.
- Structured log correlation id per detection (uuid v4).

Tasks

1. Metrics module (prom-client) (S).
2. Instrument detection pipeline (XS).
3. Augment log context (XS).
4. Expanded health route (S).
5. Tests: metrics scrape includes expected counters after simulated detection (S).

Acceptance Criteria

- Metrics endpoint returns >0 for detection counter after test.
- Latency histogram buckets present.

---

## Phase 6 – Hardening & CI Quality Gates

**Goal:** Raise confidence / reduce regressions before broader adoption.

Deliverables

- Coverage gate >= 85% (lines core modules).
- CodeQL action (already stubbed) passing with zero critical/unresolved alerts.
- Security scanning (`npm audit` high severity gating is warn-only; consider fail if patch available).
- Release artifact zip includes SBOM (cyclonedx-npm) + coverage summary.
- Changelog generation (conventional commits) & version bump script.

Tasks

1. Enforce coverage threshold in test script (XS).
2. Add SBOM generation to release workflow (S).
3. Add changelog (auto-changelog or conventional-changelog) (S).
4. CI step: run integrity verifier (XS).
5. Document security posture summary (XS).

Acceptance Criteria

- CI fails if coverage below threshold.
- Release artifacts show SBOM + dist.
- Integrity verifier step green.

---

## Phase 7 – Extensibility: Additional Token Types

**Goal:** Prove pluggable architecture for honeytoken varieties.

Deliverables

- Token generator interface `ITokenGenerator { type; generate(): {secret, display, metadata} }`.
- Implement `FakeApiKeyGenerator` (pattern: prefix + random) and adapt existing mock AWS to conform.
- Factory registry keyed by type.
- Tests ensuring new token added does not require modifying detection code (open/closed principle proven).

Tasks

1. Interface + refactor existing (M).
2. New generator + unit tests (S).
3. Update create flow to use registry (S).
4. Update docs enumerating token types (XS).

Acceptance Criteria

- Adding a dummy generator in test does not require changing service code (only registry entry) – proven by test.

---

## Phase 8 – Pre-Production Stabilization

**Goal:** Validate reliability under moderate load & finalize user experience.

Deliverables

- Load script (k6 or custom Node) simulating detection bursts (e.g., 10/sec for 60s).
- Lock contention mitigation (serialize detection writes or WAL mode set).
- Graceful shutdown (stop detection loop, flush pending alerts).
- Comprehensive README + architecture section diagrams (Mermaid).
- Onboarding checklist doc.

Tasks

1. Enable SQLite WAL mode on init (S).
2. Add shutdown hooks (SIGINT/SIGTERM) (S).
3. Load test harness & metrics capture (M).
4. Document capacity assumptions (XS).
5. UX polish (consistent CLI output formatting) (XS).

Acceptance Criteria

- Zero failed writes during load test.
- p95 detection latency < 1s in mock load.

---

## Phase 9 – Optional Real AWS Integration (Feature Flagged)

**Goal:** Replace mock AWS token generation with optional real IAM key issuing.

Deliverables

- AWS provider module (STS + IAM wrapper) with least privilege policy template + tagging.
- Feature flag `AWS_INTEGRATION=1`; fallback to mock when off.
- Secure storage of key ID + secret (only hash + salt persisted; secret shown once).
- Rotation hooking real key revoke + recreate.
- Additional tests (mocked AWS SDK) verifying call sequences.

Tasks

1. Policy template & doc (S).
2. AWS client wrapper + interface (M).
3. Create path integration (M).
4. Rotation path integration (M).
5. Tests with AWS SDK v3 mocks (S).
6. Security review checklist (S).

Acceptance Criteria

- Successful dry run in sandbox account: create, rotate, revoke operations logged.
- No secret value stored in DB (only hash) – verified.

---

## Cross-Cutting Concerns & Continuous Activities

| Concern              | Activity                                     | Frequency         | Owner   |
| -------------------- | -------------------------------------------- | ----------------- | ------- |
| Docs Sync            | Update README, INSTRUCTION, BUILD_PHASE_PLAN | End of each phase | DOC     |
| Dependency Hygiene   | `npm outdated` review                        | Weekly            | BE      |
| Security Review      | Quick threat model delta                     | Phase gate        | SEC     |
| Performance Baseline | Capture metrics snapshot                     | Phase 2,5,8       | ARCH    |
| Backlog Grooming     | Reprioritize items                           | Bi-weekly         | ARCH/BE |

---

## Risk Register (Rolling)

| Risk                           | Phase Most Relevant | Impact | Likelihood | Mitigation                                     |
| ------------------------------ | ------------------- | ------ | ---------- | ---------------------------------------------- |
| Hash chain race corruption     | 2                   | High   | Medium     | Transactional insert + ordered retrieval       |
| Alert spam (loop)              | 4                   | Medium | Low        | Idempotency key per detection event            |
| Slack webhook leakage          | 4                   | High   | Low        | Do not log webhook; mask env in logger         |
| SQLite file locking under load | 8                   | Medium | Medium     | WAL mode + serialized queue                    |
| AWS key privilege creep        | 9                   | High   | Low        | Static least-priv policy + periodic diff check |

---

## Metrics Catalog (Cumulative)

| Metric                             | Type      | Labels         | Source              | Purpose           |
| ---------------------------------- | --------- | -------------- | ------------------- | ----------------- |
| detections_total                   | Counter   | source         | detection engine    | Volume tracking   |
| alerts_sent_total                  | Counter   | adapter,status | dispatcher          | Reliability       |
| alert_failures_total               | Counter   | adapter,reason | dispatcher          | Retry tuning      |
| detection_pipeline_latency_seconds | Histogram | -              | wrap around process | Performance SLO   |
| rotations_total                    | Counter   | type           | rotation service    | Lifecycle measure |
| integrity_failures_total           | Counter   | reason         | verifier            | Security posture  |

---

## Definition of Done (Per Phase Augmentation)

Minimum each phase:

1. All new code covered by unit or integration tests.
2. Lint + typecheck pass with zero new warnings.
3. Documentation updated (README or this plan) reflecting new surfaces.
4. Security / secret handling reviewed for regressions.
5. CI run recorded and archived (GitHub Actions).

---

## Suggested Timeline (Indicative – adjust as reality dictates)

| Week | Focus                        | Key Milestones                     |
| ---- | ---------------------------- | ---------------------------------- |
| 1    | Phase 0 wrap & start Phase 1 | API skeleton endpoints green       |
| 2    | Finish Phase 1 & Phase 2     | Simulate detection end-to-end      |
| 3    | Phase 3 & 4                  | Rotation + Slack alerts signed     |
| 4    | Phase 5 & 6                  | Metrics + coverage gate 85%        |
| 5    | Phase 7 & 8                  | New token type + load test results |
| 6    | Phase 9 (optional)           | Real AWS integration dry-run       |

---

## Backlog Parking Lot (Future Considerations)

- Postgres migration path (Prisma shadow DB).
- Event sourcing for detections (append-only log shipping).
- SOAR hooks (quarantine actions).
- DNS / network beacon honeytokens.
- Attestation with Sigstore for rotations.
- UI dashboard (later).

---

## Update Procedure

1. End of each phase: mark tasks `[DONE]`, add metrics snapshot.
2. Create new section if scope added mid-phase; avoid silent scope creep.
3. Reference commit SHAs for major architectural shifts.

---

Maintainer Note: Keep this synchronized with `INSTRUCTION.md` Sections 20–24. If divergence occurs, treat this file as the tactical execution planner; reconcile within 24h.
