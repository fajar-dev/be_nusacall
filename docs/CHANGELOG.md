# 📝 Changelog

Semua perubahan penting pada proyek ini akan didokumentasikan di file ini.

Format mengikuti [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [0.1.0] — 2026-06-18

### Added

- Initial release

---

## [0.7.0] — 2026-08-24

### Added

- **Call history & phone-number admin (Milestone 1.6 — final Fase 1 milestone)**:
  `GET /api/call`, `/api/call/:id`, `/api/call/stats` (filter by status/direction/agent/
  phone number/date range, search, sort). `modules/phone-number/` — full repository/
  service/controller; `MetaClient.getCallSettings`/`getHealthStatus` added alongside the
  existing `updateCallSettings`. Every save pushes the FULL config to Meta (replace, not
  merge) and keeps the local save even if the Meta push fails.
- 15 new tests (`call-rest.test.ts`, `phone-number.test.ts`) — 94 total across the backend.
- `swagger.yaml` — Call and Phone Number paths/schemas added.

## [0.6.0] — 2026-08-24

### Added

- **Contact context & call logging (Milestone 1.5)**: `NusawaClient.findInboxByContact`/
  `getInboxDetail`/`logCallMessage` (all call-path — never throw, 2s timeout). Wired into
  `CallSignalingService.notifyIncoming()`: looks up the caller's nusawa ticket, routes
  directly to an online PIC (`RoutingService` PIC-matching), and includes contact name/last
  message/tags/thread link in the `incoming_call` packet.
- `nusawa_log_queue` retry pipeline: `TypeOrmNusawaLogQueueRepository`, `NusawaLogService`
  (backoff 5s/30s/2m/10m/1h per docs/INTEGRATION-NUSAWA.md §3.5), triggered from
  handleReject/handleHangup/expireIfStillRinging and from the webhook `terminate` path
  (gated on the state transition actually winning, so two racing end-of-call paths never
  double-log). `src/jobs/index.ts` — `flushNusawaLogJob` (30s) and `reconcileCallsJob` (2m,
  wired up `CallService.reconcileStale` which existed but was never scheduled).
- 12 new tests: PIC-routing, degradation (nusawa throwing mid-lookup never blocks a call),
  `NusawaLogService` backoff/abandon, and a webhook↔signaling integration test proving no
  double-logging when an agent's hangup and Meta's terminate webhook race.

### Fixed

- **`mysql2` was serializing dates in the process's local timezone, not UTC** (no
  `timezone` option was set) — silently corrupting every datetime round-trip on any host
  not running in UTC. Set `timezone: "Z"` on both DataSources.
- **Plain `DATETIME` columns round to the nearest second**, which could round a
  just-inserted `nextAttemptAt: new Date()` value up past the moment a query read it,
  making a fresh row look not-due-yet. This was the actual cause of ~50% flaky
  `NusawaLogService` test failures — initially misdiagnosed as a cross-test-file DB race.
  Fixed with `precision: 3` on `NusawaLogQueue.nextAttemptAt`.

## [0.5.0] — 2026-08-23

### Added

- **Signaling & softphone backend (Milestone 1.4)**: `gateway/signaling.gateway.ts` (WS
  transport, JWT-in-query auth), `modules/call/call-signaling.service.ts` (answer/reject/
  hangup orchestration, Meta accept/reject/terminate, automatic answer-timeout), and
  `modules/routing/routing.service.ts` (broadcast-to-available-agents strategy — full
  `pic_then_queue` deferred to Milestone 1.5/1.6, which need the phone-number module and
  nusawa contact lookup). `webhook.service.ts` now rings agents after `establishEarly`
  succeeds. 12 new tests (routing + call-signaling) against a real DB and real werift
  negotiation, including a concurrent-answer race and a Meta-accept-failure path.
- `modules/contact/` — read-only proxy over nusawa's `GET /api/contacts`, using a new
  `NusawaSessionRegistry` (caches each agent's nusawa token from login, since that
  endpoint is gated behind agent identity, not an API key). In-memory TTL cache. 7 tests.
- `modules/call/call.module.ts` — shared `callRepository`/`callStateService` wiring,
  extracted out of `webhook.module.ts` so `gateway/signaling.module.ts` can use the same
  instances without a circular import.

### Changed

- **Auth login no longer calls nusawa from the browser.** `POST /api/auth/login` now takes
  `{ email, password }`; the backend relays to nusawa's `POST /api/login` then `GET
  /api/me`, both server-side. Frontend's direct-to-nusawa login service is gone.
- **Database: PostgreSQL → MySQL, full removal.** `pg` dropped, `jsonb`→`json`,
  `timestamptz`→`datetime` across all entities, `docker-compose.yaml` rewritten for MySQL,
  every doc/boilerplate mention fixed.
- `tsconfig.json` gained `target`/`lib`/`skipLibCheck`; `typescript` pinned to `^5.7.0` as
  a real devDependency — `bunx tsc` was silently fetching the newest major (TypeScript 7)
  each run, which can't resolve `bun:test`'s ambient types.
- `swagger.yaml` rewritten from scratch — it was still the original boilerplate spec
  (`/auth/google`, `/user` CRUD) with zero overlap with the real API surface.
- Trimmed a broad set of overlong/redundant comments across `src/` per an explicit
  audit pass — no behavior change.

## [0.4.0] — 2026-08-23

### Changed

- **Auth login no longer exposes nusawa to the browser.** Previously the frontend called
  nusawa's own `POST /api/login` directly (cross-origin, browser-to-nusawa) and relayed the
  resulting JWT to `POST /api/auth/login` as `{ nusawaToken }`. This leaked nusawa's origin
  to the client and required CORS on a system NusaCall does not own. `POST /api/auth/login`
  now accepts `{ email, password }` directly and does BOTH nusawa calls server-side:
  `NusawaClient.login(email, password)` (new — `POST /api/login`) followed by the existing
  `NusawaClient.getMe(token)` (`GET /api/me`). See docs/INTEGRATION-NUSAWA.md §2.2, §3.2a.
- `LoginValidator` now validates `{ email, password }` instead of `{ nusawaToken }`.
- `AuthService.loginWithNusawaToken()` renamed to `AuthService.login(email, password)`.

---

## [0.3.0] — 2026-08-23

### Added

- **Media bridge (Milestone 1.2 — docs/ROADMAP.md)**: `infrastructure/meta/meta.client.ts`
  (Graph API wrapper: pre_accept/accept/reject/terminate/connect/call_permissions/
  updateCallSettings), `infrastructure/media/{peer-factory,sdp-transformer,media-session,
  session-registry}.ts`.
- `MediaSession` — one call = two independently-negotiated WebRTC legs (Meta ↔ NusaCall ↔
  Agent) bridged via `RtpPacket` forwarding, formalizing the pattern proved in the Fase 0
  spike. `startForwarding()` gates RTP flow until explicitly enabled — media must not flow
  before Meta's `accept` returns 200 OK (docs/MEDIA-PLANE.md §5).
- `sdp-transformer.ts` — `ensurePtime20()` and `validateOutboundSdp()`, a safety net that
  catches a malformed outbound SDP locally (missing fingerprint, multiple SSRCs, wrong Opus
  clock rate) instead of a round trip to Meta.
- `ICallMediaCoordinator` / `CallMediaCoordinator` — bridges `WebhookService` to the media
  plane without coupling state-machine logic to WebRTC. `handleConnect` now calls
  `establishEarly()` (pre_accept) as a side action for inbound calls — it does NOT drive a
  state transition on success (see the corrected `CONNECTING` semantics in
  docs/CALL-LIFECYCLE.md, fixed this same session); on failure it transitions to `FAILED`.
  `handleTerminate` now tears down the session.
- `test/media-session.test.ts` (8 tests) — full Meta-leg/Agent-leg bridge exercised against
  real werift negotiation (not mocks), plus SDP validator unit tests.
- `GET /health` now reports `media.activeSessions`; `POST /internal/drain` closes all active
  media sessions (for use before a rolling restart — the media plane is stateful).

### Fixed

- **docs/CALL-LIFECYCLE.md**: corrected the `CONNECTING` state description and BIC connect
  mapping, which had contradicted docs/MEDIA-PLANE.md's own signaling sequence (pre_accept
  was incorrectly described as driving a state transition; it does not — it's a side action
  taken while the call is still `PENDING`).

### Notes

- `test/webhook.test.ts` continues to use a no-op `ICallMediaCoordinator` (see
  `test/setup.ts`) so state-machine assertions stay decoupled from WebRTC timing — media
  behavior is covered separately in `test/media-session.test.ts`.
- Full field verification (a real call from a phone to a Meta test number) requires live
  Meta App credentials, which this environment does not have. Everything short of that has
  been built and tested: SDP negotiation, DTLS/SRTP, bridging, and the Graph API client.

---

## [0.2.0] — 2026-08-23

### Added

- **Webhook pipeline (Milestone 1.1 — docs/ROADMAP.md)**: `GET /wh` handshake, `POST /wh`
  receiver with Meta `x-hub-signature` (HMAC-SHA1) verification and fast `204` reply
  (processing deferred via `queueMicrotask`, per docs/CALL-LIFECYCLE.md §5).
- `CallStateService` — the call state machine. Two rules only: monotonic rank transitions
  and terminal-state absorption, both enforced by a SQL-level guard
  (`UPDATE ... WHERE status_rank < :nextRank`) so concurrent/out-of-order webhook delivery
  cannot corrupt state. See docs/CALL-LIFECYCLE.md §2.3.
- Idempotency via `call_events.dedup_key` (unique constraint) — duplicate Meta webhook
  deliveries are detected and dropped before any state mutation.
- Staleness guard — webhooks older than `WEBHOOK_STALE_SECONDS` are recorded for audit but
  do not drive a transition.
- `Call`, `CallEvent`, `PhoneNumber`, `Agent`, `NusawaLogQueue` entities and enums
  (`CallStatus` + rank table, `CallDirection`, `EndReason`).
- Agent module: roster (`Agent` entity/repository/service), in-memory `PresenceRegistry`
  (deliberately not persisted — see docs/BACKEND-MODULES.md §3), `GET /api/agent`,
  `GET /api/agent/available`, `GET /api/agent/me`, `PUT /api/agent/:username`,
  `PUT /api/agent/me/availability`.
- NusaCall-issued JWT auth (`AuthHelper.signAgentToken`, `authMiddleware`,
  `tokenAuthMiddleware`) — replaces the boilerplate's local password auth. Identity itself
  is still relayed from nusawa (`GET /api/me`); that relay lands in Milestone 1.3.
- `core/helpers/signature.ts` — Meta webhook signature verification (constant-time compare).
- `GoneException`, `BadGatewayException`, `ServiceUnavailableException` added to
  `core/exceptions/base.ts` for NusaCall-specific error semantics (docs/API-SPEC.md §10).
- Config blocks: `meta`, `nusawa`, `call`, `media` in `src/config/config.ts`.
- E2E test suite `test/webhook.test.ts` (13 tests) covering the 6 mandatory lifecycle
  scenarios from docs/CALL-LIFECYCLE.md §2.4: normal flow, reversed webhook order,
  triplicate duplicate connect, stale terminate, duplicate terminate after completion,
  and status-before-connect.
- `werift` added as a dependency after a WebRTC-in-Bun feasibility spike passed in full
  (handshake, SRTP, bridge forwarding with SSRC rewrite, 10 concurrent sessions). See
  docs/SPIKE-RESULTS.md. Media plane will run in-process — no separate Node process needed.

### Removed

- Boilerplate example modules (`user`, `contact`, `auth`) and their entities, tests, and
  routes — these were pattern references only, not meant to be extended into the product
  (per project instruction). `src/core/helpers/{mail,hash}.ts` and `src/config/smtp.ts`
  removed as unused (no email/password features in NusaCall). Dependencies `nodemailer`,
  `google-auth-library`, `bcryptjs` and their `@types/*` removed accordingly.

### Changed

- `src/core/middlewares/auth.middleware.ts` and `token-auth.middleware.ts` now resolve
  `Agent` (by `username`) instead of `User` (by numeric `id`).
- `test/setup.ts` and `test/helpers.ts` rewritten for NusaCall entities and webhook payload
  factories (`createConnectWebhookPayload`, `createStatusWebhookPayload`,
  `createTerminateWebhookPayload`).

---

## Template Entri Baru

```markdown
## [X.Y.Z] — YYYY-MM-DD

### Added

- Fitur baru

### Changed

- Perubahan pada fitur yang sudah ada

### Deprecated

- Fitur yang akan dihapus di versi mendatang

### Removed

- Fitur yang dihapus

### Fixed

- Perbaikan bug

### Security

- Perbaikan keamanan
```

### Versioning Rules

- **MAJOR** (X.0.0): Breaking changes, perubahan arsitektur besar
- **MINOR** (0.X.0): Fitur baru, module baru, penambahan endpoint
- **PATCH** (0.0.X): Bug fix, perbaikan kecil, update dependencies
