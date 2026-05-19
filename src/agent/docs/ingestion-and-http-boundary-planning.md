# Oiva ingestion: HTTP boundary + workflow handoff

Working notes for team covering what is included in this branch, the decisions behind
it, and the open items we should weigh in on as a team. This document is _temporary_ and will be deleted or absorbed into proper docs once we've all reviewed.

> Note: "This draft was written with Claude Code as navigator; the architectural calls are mine/ours but several recommendations are noted as Claude's suggestions for the team to consider."

## What was added

- `oivaWorkflow` with two steps:
  - `verifyStep` — shared-secret auth check + filter (test alerts, status != TRIGGERED).
  - `normalizeStep` — converts Honeycomb webhook payload into a vendor-neutral `AlertContext`.
- `POST /hook/honeycomb/alert` HTTP endpoint, registered as a custom Mastra `apiRoute` (Hono
  handler). Validates JSON => schema => auth, then hands off to the workflow.
- Adapter module (`adapters/honeycomb-adapter.ts`) holds the pure verify+normalize functions.
  Workflow steps call them; HTTP handler calls them for the auth path.
- Types split along the hexagonal seam:
  - `types/alert-context.ts` — domain types (`AlertContext`, `FilteredOutcome`). Vendor-neutral.
  - `types/honeycomb-alert.ts` — Honeycomb wire-format types.
- Validated end-to-end via Mastra Studio and curl smoke tests against five scenarios: malformed
  JSON, wrong shape, wrong secret, filtered (test alert), and actionable.

## Architecture decisions

### 1. Ingestion lives inside the workflow, for now

Verify + normalize are workflow steps, not vendor-specific HTTP adapters.

- **Why:** Honeycomb is the only vendor on the table right now, and seeing verify/normalize show up as discrete steps in Mastra Studio is useful while we iterate.
- **What we gave up:** A second vendor (Datadog, SigNoz) would either duplicate these steps per workflow or make them vendor-aware via a switch.
- **The escape hatch:** Nothing in the workflow downstream of `normalizeStep` may import from
  `types/honeycomb-alert.ts`. As long as that rule holds, migrating to an "Option B" in which verify+normalize are lifted out of the workflow, and workflow input becomes `AlertContext` is a refactor of two steps. **Enforce in code review.**

### 2. HTTP boundary lives inside Mastra, not standalone Express

Three real shapes were on the table:

- **Option 1 — Mastra custom `apiRoute` (Hono handler).** What I picked for this branch.
- **Option 2 — Standalone Express importing the Mastra instance in-process.** Rejected: shared LibSQL/DuckDB storage = lock contention with `mastra dev`. Would force a choice between Express and Studio during development.
- **Option 3 — Standalone Express proxying HTTP to Mastra Server.** Rejected: extra hop and two URLs to manage for a spike.

The appeal of the "Express" choice was the control over the HTTP boundary (path, response codes, middleware) it gave us, not the specific framework in itself. Mastra's `apiRoutes` gives us that control through Hono, with Studio integration for free and one process to run. I included more notes on Hono below.

### 3. Validation responsibility is split between boundary and workflow

Per Khorikov's "validate at boundary, trust internal code" guideline:

- **HTTP boundary owns:** JSON parsing (400 invalid-json), schema parsing (400 invalid-payload), authentication (401 unauthorized).
- **Workflow owns:** Filter rules (`isTest` → bail; `status != TRIGGERED` → bail). Filter decisions stay inside the workflow specifically so they appear in Studio with their reason: "show me all the test alerts we filtered this week, by environment" is one query.

Note: `verifyStep` in the workflow still has the "invalid" branch even though the HTTP boundary already rejected those. This is defense-in-depth: future code paths (tests, internal triggers) that bypass HTTP would otherwise skip auth.

### 4. Workflow runs are fire-and-forget

`run.start({ inputData })` returns a Promise that resolves when the entire workflow finishes. We don't await it. We capture the `runId` immediately and return 202.

- **Why:** Investigation steps will take seconds-to-minutes once LLM and Honeycomb MCP land.
  Holding the HTTP response open would invite Honeycomb's webhook retry timer (= duplicate
  deliveries) and load balancer timeouts.
- **What we gave up:** If Node restarts mid-run, the run is orphaned. The OTel span captures the in-flight state, but the workflow can't resume.
- **Mitigation today:** `.catch()` attached to the unawaited Promise so failed runs surface in
  the Mastra logger rather than becoming silent unhandledRejections.
- **Fix later:** Mastra's Inngest integration or a real job queue for durable execution. (\*need to look more into these options, but worth implementing before/with investigation step?)

## Vendor neutrality: where we're at in this branch vs. future directions towards vendor neutraliity

The URL `/hook/honeycomb/alert` is vendor-explicit on purpose. If the team (or future users) adds Datadog or SigNoz, each would get its own route:

```
POST /hook/honeycomb/alert  → honeycombAdapter
POST /hook/datadog/alert    → datadogAdapter
POST /hook/signoz/alert     → signozAdapter
```

The natural future shape is a port-and-factory pattern:

```ts
// src/mastra/ports/alert-adapter.ts — created when 2+ adapters exist
interface AlertAdapter<RawPayload> {
  vendor: string;
  schema: ZodSchema<RawPayload>;
  verify(payload: RawPayload, secret: string | undefined): VerifyResult;
  normalize(payload: RawPayload): AlertContext;
}

// HTTP handler becomes a generic factory
function makeAlertHookHandler<P>(adapter: AlertAdapter<P>) { ... }
```

At that point, `verifyAlert` and `normalizeAlert` migrate **out of** the workflow into the HTTP
boundary, and `oivaWorkflow.inputSchema` becomes `AlertContextSchema` (vendor-neutral). The
workflow becomes one investigation engine that doesn't know or care which vendor sent the alert.

**The port (interface) is deliberately NOT built yet.** With one adapter, an interface would be
single-implementation decoration. We build it if/when a second vendor lands.

**The discipline that keeps the migration cheap (repeated for emphasis):** No file outside
`types/honeycomb-alert.ts`, `adapters/honeycomb-adapter.ts`, and the workflow's first two steps
may import the Honeycomb wire types.

## Quick Hono primer

Mastra's HTTP layer is Hono (not Express). Hono is Express-shaped at the API level but uses a
different abstraction: **one `Context` object** instead of separate `req` and `res`.

| Express                       | Hono                              |
| ----------------------------- | --------------------------------- |
| `(req, res, next) => {...}`   | `(c) => {...}`                    |
| `req.body` (with body-parser) | `await c.req.json()`              |
| `req.params.id`               | `c.req.param("id")`               |
| `req.query.foo`               | `c.req.query("foo")`              |
| `req.header("X-Foo")`         | `c.req.header("X-Foo")`           |
| `res.json(data).status(202)`  | `c.json(data, 202)`               |
| `res.send(...)`               | `c.body(...)` / `c.text(...)`     |
| `app.use(middleware)`         | `app.use(middleware)` (same idea) |

## Mastra + Hono integration gotchas

Things worth knowing before we write more routes:

1. **`c.get("mastra")` returns `any`.** Hono's per-request store is untyped by default. Without
   a cast, you lose type safety on everything downstream (`getWorkflow`, `getLogger`, etc.). Cast at the call site:
   ```ts
   import type { Mastra } from "@mastra/core/mastra";
   const mastra = c.get("mastra") as Mastra;
   ```
2. **`mastra.getWorkflow("...")` uses the property name from the Mastra constructor, NOT the workflow's own `id` field.**
   ```ts
   new Mastra({ workflows: { oivaWorkflow } }); // lookup key is "oivaWorkflow"
   createWorkflow({ id: "oiva-workflow" }); // this id is irrelevant for lookup
   mastra.getWorkflow("oivaWorkflow"); // matches the key
   ```
   Rename the property and the lookup breaks silently at runtime.
3. **`workflow.createRun()` is async** Returns `Promise<Run>`, not `Run`.We must `await` it.
4. **`IMastraLogger.error`'s signature is `(message: string, ...args: any[])`.** We don't
   currently know whether structured fields in `args` become indexable JSON keys or get stringified into the message. We should verify by triggering a failing run and inspecting the emitted log line. If structured logging matters to us (it does for Honeycomb queryability), Claude says we may need to bypass Mastra's wrapper and use Pino directly.

## Future work (and decisions to make as a team)

### 1. Idempotency / dedupe at the HTTP boundary

Webhook delivery is at-least-once, not exactly-once. Honeycomb retries if it doesn't get 2xx
within its timeout window — could be our crash, our slowness, a network blip, or HC's own retry logic. Without dedup, the same `alert.instanceId` POSTed twice could lead to two parallel investigations of the same incident.

The cache belongs at the HTTP boundary (the layer where redelivery actually happens), not inside the workflow. Our options, according to Claude:

- Spike-grade: in-memory `Map` with TTL (1hr? or longer than HC's retry window).
- Production-grade: LibSQL or Redis-backed.

`alert.instanceId` is already on `AlertContext` so the dedupe key travels with the context downstream.

### 2. Durable execution

Right now the "fire-and-forget" setup loses workflow runs if Node restarts. Production needs Mastra's Inngest integration or a job queue. (See #4 in Hono section above)

### 3. Observability span enrichment

`verifyStep` and `normalizeStep` each currently emit one OTel span. Worth adding span attributes (`alert.instance_id`, `alert.trigger_name`, `alert.environment`, `alert.is_test`,
`alert.status`, `alert.filter_reason`) so we can make queries like "how many test alerts did we filter this week, by environment" in Honeycomb.

### 4. Real Honeycomb trigger smoke test

The "smoke tests" I ran today used synthetic curl payloads. It'd be worth wiring an actual HC trigger via ngrok (or something similar) to validate the full path with HC's real webhook template substitution (`{{  .Recipient.Secret }}`).

### 5. The migration option for vendor neutrality

When a second vendor joins, migrate verify+normalize out of the workflow into vendor-specific
HTTP handlers, change `oivaWorkflow.inputSchema` to `AlertContextSchema`, and introduce the
`AlertAdapter` port. See "Vendor neutrality" section above.

## Open questions for the team

- Is `docs/` the right home for this kind of branch-scoped writeup, or do we have a different
  convention I missed?
- Any architecture decisions worth revisiting at this step before we dive deeper into the agentic steps?
