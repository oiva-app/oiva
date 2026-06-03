# Live Incident Updates + Lifecycle Handling — Plan

_Last updated: 2026-06-02_

## Goal

Turn the Slack incident message from an end-of-run report post into a **live,
in-place incident thread** that updates as the investigation progresses, and
add proper **incident lifecycle handling**: a `failed` state, user-driven
Retry/Close, and a cleanup reaper.

Two-person split:
- **[Slack]** — the Slack-touching pieces: `SlackProgressReporter` adapter,
  block rendering, ack/thread updates, delegation-hook wiring.
- **[Data]** — data layer / domain: migration, repo methods, state machine,
  failure transition, reaper.
- **[Together]** — shared contracts and the integration files both lanes touch.

---

## Architecture decisions (locked)

- **Model A — single evolving message.** One root message per incident, updated
  in place (`chat.update`) with growing blocks. No threaded milestone replies.
- **Delegation-level live updates** via a `ProgressReporter` port, driven by the
  supervisor's `onDelegationStart` / `onDelegationComplete` hooks (sub-agents run
  sequentially). The agent stays Slack-agnostic — it depends on the port, never
  `@slack/web-api`.
- **Option A — in-memory render state.** The reporter holds each incident's
  render model (badge, log lines, attach counter) in an in-process `Map`;
  nothing persisted. Consequences:
  - migration carries **no activity-log column**;
  - human Close/Retry renders reconstruct from `message.blocks` in the Slack
    payload;
  - the **reaper renders cold → posts a "🔒 Auto-closed" reply** rather than
    rebuilding/flipping the root;
  - a retry starts a **fresh** log model (same thread, fresh lines);
  - **assumes single-instance deployment.**
- **Findings, not just activity.** Delegation completion lines carry a one-line
  `headline` (sub-agents lead with a `HEADLINE:` line; hook parses it, first-line
  fallback). Separate pipeline from the report's investigation trace.

## Lifecycle decisions

- **Q1 — attached alerts:** a single **in-place counter line** ("↻ N related
  alerts") on the active incident's message; coalesced, not one post per alert.
- **Q2 — recurrence after delivery:** **new incident** (already the default —
  `report_delivered` is excluded from correlation). _Deferred, no work._
- **Q3 — surface recurrence to users:** _Deferred._
- **Q4 — failed investigations:** dedicated **`failed`** state (not `closed`),
  **Retry + Close buttons**, and a **cleanup reaper**. `failed` is excluded from
  correlation (no longer attracts alerts) but is not a dead-end — it drains to
  `closed` via Retry, human Close, or the reaper.

---

## State machine (`domain/incident-state.ts`)

```ts
const VALID_TRANSITIONS: Record<IncidentStatus, readonly IncidentStatus[]> = {
  triggered:         ["investigating", "failed", "closed"],
  investigating:     ["report_in_process", "failed", "closed"],
  report_in_process: ["report_generated", "failed", "closed"],
  report_generated:  ["report_delivered", "failed", "closed"],
  report_delivered:  ["closed"],          // Close button on the happy path
  failed:            ["investigating", "closed"],  // retry + give-up/reaper
  closed:            [],                   // the only true dead-end
};
```

- `failed → investigating` is the **Retry** path (same incident, same thread;
  the workflow's investigate step performs the transition, not the handler).
- `triggered → failed` exists only for the reaper's "never-started" safety net
  (optional — could go straight to `closed` instead).
- **Watch-out:** with `report_delivered → closed` added, `report_delivered` is no
  longer terminal per `isTerminal()` (only `closed` is). Correlation uses its own
  `NOT IN (...)` list so it's unaffected, but grep other `isTerminal` callers.

---

## Data model changes

### Migration `0002`
- Fix the stale `incidents.status` CHECK (currently `report_generating`,
  `reported`) to the real enum **and add `failed`**.
- Add `slack_thread_ts TEXT`, `slack_channel_id TEXT` (nullable).
- Add `status_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()` (reaper timer).
- **No** activity-log column (Option A).

### Slack ids in both `incidents` and `reports` (transitional)
- The root-message `ts` lives on **`incidents`** as the source of truth (the
  reporter reads only this — the report doesn't exist at announce time).
- `reports.slack_message_id` stays as a denormalized convenience for the existing
  rating handler.
- **Write discipline:** the report's `ts` must be **copied from**
  `incidents.slack_thread_ts` at delivery (the new send step updates the root, it
  does not post a new message), so the two copies can't point at different
  messages.
- `// TODO:` the `reports` copy is redundant long-term (rating could resolve the
  thread via the incident).

---

## Contracts

### `ProgressReporter` port — ✅ committed
`ports/progress-reporter.ts` + `testing/fake-progress-reporter.ts`.
Methods: `incidentOpened`, `statusChanged`, `milestone`, `delegationStarted`,
`delegationCompleted`, `alertAttached`, `reportReady`, `attachReportFile`,
`incidentFailed`, `incidentClosed`. Slack-agnostic; all non-throwing.

### `IncidentRepository` port — ✅ committed
Added `failed`; `statusUpdatedAt`, `slackThreadTs`, `slackChannelId` on
`Incident`; `attachSlackThread`; `findStaleIncidents`.

### `incident-service` (close/retry) — ✅ written
`services/incident-service.ts`, deps-injected for testability.

```ts
closeIncident(id, by: ClosedBy, { incidents, reporter }): Promise<void>;
//  findById → no-op if already closed → assertTransition → updateStatus →
//  reporter.incidentClosed(id, by)   (reaper passes {kind:"reaper"})

retryIncident(id, { incidents, loadAlertContext, dispatch }): Promise<void>;
//  findById → no-op unless status === "failed" → loadAlertContext(id) →
//  dispatch(id, alert)   (workflow's investigate step owns failed→investigating)
```

Refinements ratified vs. the original sketch:
- retry injects `loadAlertContext(id) => Promise<AlertContext | null>` instead of
  `alerts: AlertRepository` — decouples the service from the alert port + normalize
  pipeline, and lets it compile/test before `findFirstByIncident` exists. The wiring
  layer composes it from `findFirstByIncident` + `normalizeAlert`.
- retry drops `reporter` (the re-dispatched workflow drives it) and **no-ops** on a
  non-failed status (stale button / double-click), rather than throwing.

### `AlertRepository.findFirstByIncident` — ⬜ to add
Retry rebuilds `AlertContext` from the stored alert:
`findFirstByIncident(incidentId) → honeycombWebhookPayloadSchema.parse(rawPayload)
→ normalizeAlert(...)`.

---

## To finalize together before splitting

1. ~~close/retry service contract~~ — ✅ ratified + written in
   `services/incident-service.ts` (see Contracts). Confirm the `loadAlertContext`
   injection refinement with the team.
2. **`AlertRepository.findFirstByIncident`** signature.
3. **`incidentOpened` idempotency** — must reuse an existing `slackThreadTs`
   instead of posting a new root (touches the adapter, the workflow, and retry).
4. **Ownership of the shared integration files** — recommend treating these as
   **joint** tasks: `oiva-workflow.ts`, `slack-rating-handler.ts` (→ dispatcher),
   `supervisor-agent.ts` (hooks), `honeycomb-hook-handler.ts` (failure path).

After these land, the two lanes are independent behind the committed ports.

---

## Phased todo

### Phase 2 — test doubles
- [x] `ProgressReporter` port
- [x] `FakeProgressReporter`
- [ ] **[Data]** in-memory fake `IncidentRepository`

### Phase 1 — data layer **[Data]**
- [ ] Migration `0002` (CHECK fix + `failed` + slack cols + `status_updated_at`)
- [ ] `db/types.ts`: add the three columns to `IncidentRow`
- [ ] Adapter: `toIncident` mapping; new cols in every `SELECT`/`RETURNING`;
      `updateStatus` sets `status_updated_at` (leaves `resolved_at` off `failed`);
      `findActiveCandidates` excludes `failed`; implement `attachSlackThread` +
      `findStaleIncidents`
- [ ] State machine: the map above
- [ ] `AlertRepository.findFirstByIncident` (port + adapter)

### Phase 3 — Slack adapter **[Slack]**
- [ ] Block builders: status badge, activity-log lines, the in-place attach
      counter, failed + closed renders
- [ ] `client.ts`: `postIncidentRoot`, `updateIncidentMessage`, `WebClient`
      `retryConfig`
- [ ] `SlackProgressReporter`: `LogEntry` model, `getOrLoadState`, `render`,
      throttle/serialize, `safe()` swallow, all port methods
- [ ] Wire the singleton

### Phase 4 — workflow integration **[Together]**
- [ ] `announce` step (`incidentOpened`)
- [ ] live `statusChanged`/`milestone`/`delegation*` calls
- [ ] `reportReady` + `attachReportFile` updating the root in place
- [ ] drop `ts`/`channel` from workflow state
- [ ] failure paths → `failed` + `incidentFailed`
- [ ] report-`ts` write discipline (copy from incident)

### Phase 5 — delegation hooks **[Slack]**
- [ ] `onDelegationStart/Complete` → reporter
- [ ] derive `incidentId` from `threadId`
- [ ] `HEADLINE:` convention + sub-agent prompt edits + label mapping

### Phase 6 — interactivity **[Together]**
- [ ] refactor `slack-rating-handler` into an `action_id` dispatcher
- [ ] Close + Retry buttons (`incidentId` in `value`)
- [x] `incident-service` (`closeIncident` / `retryIncident`)
- [ ] handlers call the service + reporter

### Phase 7 — reaper **[Data → Together]**
- [ ] cron, 3 sweeps via `findStaleIncidents`:
      delivered + quiet → close; failed + quiet → close; stuck non-terminal past
      deadline → failed
- [ ] calls `closeIncident(id, {kind:"reaper"})` → reporter posts a reply

### Phase 8 — error handling **[Together]**
- [ ] replace the bare `.catch(log)` in the webhook handler with the failure path
- [ ] bounded Mastra step retries before `failed`

### Phase 9 — testing
- [ ] state machine; reporter vs fake repo; repo + reaper vs fake reporter;
      dispatcher routing; headline parse; integration happy/fail/close/retry

---

## Open decisions to ratify
- close/retry: ✅ ratified (`loadAlertContext` injection; retry no-ops on non-failed).
- `triggered → failed` vs `triggered → closed` for never-started incidents.
- `resolved_at` excludes `failed` (recommended).
- reaper timer basis: `status_updated_at` (entered-state) vs quiet-since-last-alert.

## Deferred
- **Q2** recurrence → new incident (already default; no work).
- **Q3** recurrence surfacing + recurrence-link column.
- Activity-log persistence (hybrid snapshot / JSONB) — only if multi-instance,
  retry continuity, or pristine reaper renders become requirements.
