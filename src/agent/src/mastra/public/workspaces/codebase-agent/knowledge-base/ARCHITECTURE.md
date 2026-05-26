# three-services-demo-app

A small, deliberately observable application built as the **demo target** for our team's incident-investigation agent. It is _not_ the agent itself.

## What this is and why it exists

The investigation agent needs something to investigate. This repo is that "something": three TypeScript microservices that emit OpenTelemetry traces to Honeycomb, with realistic failure modes built in. When we demo the agent, we can point it at this app's incidents.

## Why this app provides a useful demo target

1. **Realistic without being huge.** Three services with real cross-service calls, each small enough to reason about in a few minutes. Big enough to demonstrate distributed-tracing problems matter.

2. **Multi-hop call graph.** A request flows `client → gateway → orders → inventory`. Single-hop traces only answer "did this endpoint fail?" Multi-hop traces let the agent ask the more interesting question: _"where in the chain did it fail, and why?"_ That's the question worth investigating.

3. **Built for OpenTelemetry from day one.** Hexagonal architecture (domain at center, adapters at edges) puts infrastructure boundaries exactly where OTel hooks naturally.

4. **Already-existing failure modes.** Real HTTP error paths exist today — `404 unknown_sku`, `409 insufficient`, `400 invalid_quantity`, `502 upstream_unavailable`. The agent has things to find without us writing fake bugs.

5. **Industry-standard observability stack.** OTel + Honeycomb is what the agent will see in real customer environments.

## Architecture

```mermaid
flowchart LR
    Client((curl / loadgen)) -->|"POST /api/orders"| Gateway
    Gateway[<b>gateway</b><br/>:3000<br/><i>opaque proxy</i>] -->|"POST /orders"| Orders
    Orders[<b>orders</b><br/>:3002<br/><i>orchestrates</i>] -->|"POST /inventory/reserve"| Inventory
    Inventory[<b>inventory</b><br/>:3001<br/><i>in-memory store</i>]

    Gateway -.->|spans| Honeycomb
    Orders -.->|spans| Honeycomb
    Inventory -.->|spans| Honeycomb
    Honeycomb[(Honeycomb)]
```

```
                                    ┌────────────┐
                                    │ Honeycomb  │
                                    └─────▲──────┘
                                          │ spans (OTel)
                ┌─────────────────────────┴─────────────────────────┐
                │                         │                         │
client ──HTTP──►  gateway  ──HTTP──►   orders   ──HTTP──►  inventory
                  :3000                 :3002                :3001
                  (proxy)              (orchestr.)         (in-mem)
```

Each request produces one trace. Spans from all three services share the same `traceId` and form a parent/child tree
the agent can walk top-down.

## Current status

| Phase                              | Status   |
| ---------------------------------- | -------- |
| Service: inventory                 | shipped  |
| Service: orders                    | shipped  |
| Service: gateway                   | shipped  |
| OTel SDK in each service           | shipped  |
| OTel → Honeycomb (sub-phase C)     | shipped  |
| Wide span attributes (sub-phase D) | shipped  |
| Load generator                     | shipped  |
| Dockerization                      | shipped  |
| Terraform / deployment             | deferred |

## Services

| Service       | Port | Role                                                                                                                                                                                        |
| ------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **gateway**   | 3000 | Public entry point. Thin opaque proxy — forwards `POST /api/orders` and `GET /api/orders/:id` to orders without parsing payloads.                                                           |
| **orders**    | 3002 | Order orchestration. Receives orders, calls inventory to reserve stock, returns a created order. `GET /orders/:id` is intentionally synthetic — there is no order persistence in this demo. |
| **inventory** | 3001 | Stock authority. Tracks SKU quantities in memory. Validates reservation requests and rejects with typed reasons (`unknown_sku`, `insufficient`, `invalid_quantity`).                        |

All three follow the same hexagonal layout (`domain/`, `infra/`, `http/`).

## Prerequisites

You need a Honeycomb Ingest API key, scoped to the environment you send traces to. Each service reads it from its own `.env`:

```
services/gateway/.env
services/orders/.env
services/inventory/.env
services/loadgen/.env
```

Quickest setup: each service ships a `.env.example` you can copy:

```bash
 cp services/gateway/.env.example services/gateway/.env
 cp services/orders/.env.example services/orders/.env
 cp services/inventory/.env.example services/inventory/.env
 cp services/loadgen/.env.example services/loadgen/.env
```

Then fill in `HONEYCOMB_API_KEY` in each. The other variables have working localhost defaults.

`.env` is gitignored. All four services - gateway, orders, inventory, and loadgen - use the same key (Honeycomb routes per `service.name` into separate datasets).

## Running it locally

You can run the full chain in two ways: with Docker Compose (one command, deterministic boot) or in host mode with per-service `npm run dev`.

### With Docker Compose (recommended)

```bash
docker compose up
```

Brings up `inventory`, `orders`, `gateway`, and `loadgen` together. Compose waits for each service's `/healthz` to pass before starting the next, so the boot order is deterministic and nothing sends traffic to a not-yet-ready upstream. Loadgen starts automatically once gateway is healthy.

Smoke test:

```bash
curl -s -X POST http://localhost:3000/api/orders \
  -H 'Content-Type: application/json' \
  -d '{"sku":"SKU-A100","quantity":1}' | jq
```

To stop the stack:

```bash
docker compose down
```

### Host mode

Three terminals (one per service):

```bash
# terminal 1
cd services/inventory && npm run dev

# terminal 2
cd services/orders && INVENTORY_URL=http://localhost:3001 npm run dev

# terminal 3
cd services/gateway && ORDERS_URL=http://localhost:3002 npm run dev
```

Each prints `OTel SDK started for service: <name>` at startup.

Smoke test (gateway → orders → inventory):

```bash
curl -s -X POST http://localhost:3000/api/orders \
  -H 'Content-Type: application/json' \
  -d '{"sku":"SKU-A100","quantity":1}' | jq
```

A single curl produces spans across all three terminals sharing one `traceId`.
