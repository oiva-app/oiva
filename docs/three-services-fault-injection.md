# Three-Services Demo App: Runtime Fault Injections

Oiva investigates incidents in distributed traces. To rehearse against it, we need _reproducible_ incidents, but we don't want to put engineered failure modes in the production code paths, because then the demo stops being a demo of real problems. The fault-injection layer resolves that tension: production code stays honest, controlled chaos lives in a thin opt-in layer at each service's HTTP boundary.

**When disabled (the default), it is a no-op.** Services behave exactly as they would in any environment.

## Two off-switches (defense in depth)

A fault fires only if **both** are true:

1. The service has `FAULT_INJECTION_ENABLED=true` in its environment, **and**
2. The request carries a spec that targets that specific service (see grammar below).

If either is missing, the request flows through untouched. Setting `FAULT_INJECTION_ENABLED=true` on a service doesn't _cause_ faults — it just gives that service permission to act on a fault spec when one arrives. Asymmetric enabling adds confusion with no benefit, so the recommended demo configuration is to set the env var to `true` on all three services and let the spec's `target` field decide which one acts per-request.

## Triggering a fault: the `x-fault-inject` header

Attach the header to a request hitting the gateway:

```
x-fault-inject: <target>:<mode>=<value>
```

| field    | values                                   | meaning                                               |
| -------- | ---------------------------------------- | ----------------------------------------------------- |
| `target` | `gateway` \| `orders` \| `inventory`     | which service should act on this fault                |
| `mode`   | `latency` \| `error`                     | inject a delay, or return an error response           |
| `value`  | integer milliseconds, **or** HTTP status | how long to delay, or what status to return (100–599) |

Examples:

```bash
# inventory takes 8 seconds — deep-hop cascading-latency scenario
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -H "x-fault-inject: inventory:latency=8000" \
  -d '{"sku":"SKU-A100","quantity":1}'

# orders returns 503 — middle-hop error scenario
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -H "x-fault-inject: orders:error=503" \
  -d '{"sku":"SKU-A100","quantity":1}'
```

## How a spec reaches the right service

The gateway reads `x-fault-inject` once at the edge and translates it into [OTel baggage](https://opentelemetry.io/docs/specs/otel/baggage/) — request-scoped key/value context that propagates automatically across service hops via OTel's W3C baggage propagator. Orders and inventory read the spec from baggage, not from any inbound HTTP header. You don't need to forward the header manually; OTel does it.

Each service's middleware then:

1. Reads the `fault.inject` baggage entry.
2. Checks `FAULT_INJECTION_ENABLED`.
3. Parses the spec and checks `target == this service's name` — bails if not it.

## Building the stack — required for the experiment

Every span carries a `service.version` resource attribute (the deployed git SHA), set from a `SERVICE_VERSION` build-arg threaded through the Dockerfile into `process.env.SERVICE_VERSION` at runtime. The investigation agent reads this to identify what code is actually running; if it's missing, the agent loses that signal. The discipline lives in the build command.

**Always build with the SHA stamped in:**

```bash
SERVICE_VERSION=$(git rev-parse --short HEAD) docker compose up -d --build
```

Run from the repo root, with whichever branch you intend to deploy checked out. `--build` is required, without it, `docker compose up` reuses the existing image with the old SHA baked in.

Slip-ups to avoid:

- _No --build_. `docker compose up -d` (or restart) reuses the existing image; new code never lands and `service.version` reports the prior SHA.
- _Missing the SERVICE_VERSION=… prefix_. Silent fallback to `service.version=unknown `(the Dockerfile ARG default). No error, but the agent's deployed-revision signal is gone.
- Host mode (npm run dev / tsx) skips the Dockerfile entirely — no `SERVICE_VERSION` set, spans show `unknown`. _Use Docker for experiments_.

Verify before firing any fault:

After the stack is up and loadgen has had ~2 min of baseline traffic, run any query on the gateway (or inventory/orders/loadgen) dataset, breaking down by `service.version`. Every span should report your current short SHA, not `unknown`. If you see `unknown`, fix the build before continuing or the agent won't be able to reason about the deployed revision.

## Running a demo scenario

For each scenario, run loadgen continuously for clean baseline traffic and, in a separate terminal, fire the faulted requests for a time-bounded window. The mix gives Honeycomb's BubbleUp something to compare against (clean population vs faulted population in the same
window).

```bash
# 5-minute window of inventory deep-hop latency on top of loadgen baseline.
# Each curl naturally blocks ~5s waiting for orders' timeout, so the loop
# self-paces — no `sleep` needed. Yields ~60 faulted requests over 5 minutes.
end=$((SECONDS + 300))
while [ $SECONDS -lt $end ]; do
  curl -s -o /dev/null \
    -X POST http://localhost:3000/api/orders \
    -H "Content-Type: application/json" \
    -H "x-fault-inject: inventory:latency=8000" \
    -d '{"sku":"SKU-A100","quantity":1}'
done
```

> **Loop pacing.** This loop self-paces only for scenario A — each curl blocks ~5s waiting for orders' timeout to fire. For scenarios that return quickly (`orders:error=503`, `inventory:error=500`, `gateway:latency=500`), add an explicit `sleep 5` inside the loop so request volume stays in the same ballpark (~60 faulted events per window) across scenarios. Otherwise B and D will fire thousands of requests and you lose the comparable-population property BubbleUp depends on.

Run one scenario per window, rotate scenarios across windows. Don't mix two different specs into the same window — the agent's first evaluation is "find the bug," and two concurrent bugs cascading into each other gives the investigation two valid answers, which you can't grade against.

Suggested rotation for a first round of agent evaluation:

| Scenario | Spec                     | What you're testing                                   |
| -------- | ------------------------ | ----------------------------------------------------- |
| A        | `inventory:latency=8000` | deepest-hop latency — agent has to walk down the tree |
| B        | `orders:error=503`       | middle-hop error                                      |
| C        | `gateway:latency=500`    | entry-hop latency                                     |
| D        | `inventory:error=500`    | deepest-hop error (different mode, same hop as A)     |

## Limitations

- **One fault per request.** Single header, single baggage entry, single spec.
- **No compound faults** (`inventory:latency=2000,inventory:error=503` — slow _and_ error in one request). Tracked for v2; would need parser changes and a multi-fault execution model.
- **No probabilistic faults** (`inventory:error=503@0.1` — fail 10% of the time). The _caller_ can produce probabilistic mixes by attaching the header to a fraction of their requests.
- **No timeout / hang / malformed-payload modes.** Tracked for v2.

_NOTE_: `FAULT_INJECTION_ENABLED=true` is omitted from the `.env.example` in the three-services-demo-app to prevent Oiva's discovery of it. Make sure to add that to your local repo's `.env` if you want to run the runtime fault injections.
