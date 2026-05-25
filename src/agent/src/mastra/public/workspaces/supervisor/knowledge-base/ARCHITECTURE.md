# Architecture

## Purpose

This repository is the **demo target** for an incident-investigation AI agent. It is not the agent itself.

The app exists so the agent has something realistic to investigate: three TypeScript microservices that emit OpenTelemetry traces to Honeycomb, with typed failure modes built in. When the agent demos, it is pointed at incidents in this app.

---

## Repository Structure

```
services/
  gateway/          public entry point (opaque proxy)
    src/
      domain/       port interfaces
      http/         Express routes + middleware
      infra/        HTTP client to orders, OTel SDK init
  orders/           order orchestration
    src/
      domain/       order types, pure business logic
      http/         Express routes + middleware
      infra/        HTTP client to inventory, OTel SDK init
  inventory/        stock authority
    src/
      domain/       inventory types, reserve logic
      http/         Express routes + middleware
      infra/        in-memory store, OTel SDK init
  loadgen/          synthetic traffic generator (not part of demo target)
    src/
      infra/        OTel SDK init

docker-compose.yml
tsconfig.base.json
```

There is no frontend, no database, and no migration system. Inventory state is held in memory, seeded at process startup.

---

## Codebase Map

| Path | Responsibility |
|---|---|
| `services/gateway/src/domain/gateway.ts` | `OrdersClient` interface + `UpstreamResponse` type |
| `services/gateway/src/http/routes.ts` | Proxy `POST /api/orders` and `GET /api/orders/:id` to orders |
| `services/gateway/src/http/middleware/headerToBaggage.ts` | Reads `x-fault-inject` header, writes it to W3C baggage |
| `services/gateway/src/http/middleware/faultInjection.ts` | Reads baggage; if target matches, injects latency or error |
| `services/gateway/src/http/middleware/errorHandler.ts` | Records unhandled exceptions on the active span, returns 500 |
| `services/gateway/src/infra/httpOrdersClient.ts` | HTTP adapter implementing `OrdersClient` |
| `services/gateway/src/infra/telemetry.ts` | OTel SDK init, OTLP exporter, propagator config |
| `services/gateway/src/server.ts` | Express app assembly, graceful shutdown |
| `services/orders/src/domain/orders.ts` | `Order` types, `InventoryClient` interface, ID/type generators |
| `services/orders/src/http/routes.ts` | `POST /orders` (reserve + create), `GET /orders/:id` (synthetic) |
| `services/orders/src/http/middleware/faultInjection.ts` | Same baggage-based fault injection, `SERVICE_NAME=orders` |
| `services/orders/src/http/middleware/errorHandler.ts` | Same span-recording error handler |
| `services/orders/src/infra/httpInventoryClient.ts` | HTTP adapter implementing `InventoryClient` |
| `services/orders/src/infra/telemetry.ts` | OTel SDK init |
| `services/orders/src/server.ts` | Express app assembly, graceful shutdown |
| `services/inventory/src/domain/inventory.ts` | `StockLevel`, `InventoryStore` interface, pure `reserve()` function |
| `services/inventory/src/http/routes.ts` | `POST /inventory/reserve`, `GET /inventory/check/:sku` |
| `services/inventory/src/http/middleware/faultInjection.ts` | Same baggage-based fault injection, `SERVICE_NAME=inventory` |
| `services/inventory/src/http/middleware/errorHandler.ts` | Same span-recording error handler |
| `services/inventory/src/infra/inventoryStore.ts` | `InMemoryInventoryStore` implementation + seed data |
| `services/inventory/src/infra/telemetry.ts` | OTel SDK init |
| `services/inventory/src/server.ts` | Express app assembly, graceful shutdown |
| `services/loadgen/src/main.ts` | Fires `POST /api/orders` (~70%) and `GET /api/orders/:id` (~30%) at configurable RPS |
| `services/loadgen/src/infra/telemetry.ts` | OTel SDK init (loadgen is trace root for each request) |

---

## Runtime Components

| Component | Entry point | Port | Responsibility |
|---|---|---|---|
| gateway | `services/gateway/src/server.ts` | 3000 | Public entry point; opaque proxy — forwards requests to orders without inspecting payloads |
| orders | `services/orders/src/server.ts` | 3002 | Orchestrates order creation; calls inventory to reserve stock |
| inventory | `services/inventory/src/server.ts` | 3001 | Stock authority; validates and processes reservations against in-memory state |
| loadgen | `services/loadgen/src/main.ts` | — | Synthetic traffic generator; drives continuous requests through gateway |

Docker Compose startup order: `inventory` → `orders` → `gateway` → `loadgen`. Each service waits for the previous service's `/healthz` to pass before starting.

---

## Request Flow

```
loadgen
  -> POST /api/orders (or GET /api/orders/:id)
gateway :3000
  -> POST /orders (or GET /orders/:id)
orders :3002
  -> POST /inventory/reserve
inventory :3001
  -> in-memory StockLevel map
```

W3C TraceContext headers (`traceparent`, `tracestate`) are propagated at each HTTP hop. All spans for a single request share one `traceId` and form a parent/child tree in Honeycomb.

---

## API Surface

### Public (via gateway)

| Method | Path | Proxied to |
|---|---|---|
| `POST` | `/api/orders` | `POST /orders` on orders |
| `GET` | `/api/orders/:id` | `GET /orders/:id` on orders |
| `GET` | `/healthz` | — (local, returns `{"status":"ok"}`) |

### Internal — orders

| Method | Path | Notes |
|---|---|---|
| `POST` | `/orders` | Validates body, calls inventory, returns created order |
| `GET` | `/orders/:id` | Synthetic — no persistence; echoes id back with randomized type |
| `GET` | `/healthz` | Health check |

### Internal — inventory

| Method | Path | Notes |
|---|---|---|
| `POST` | `/inventory/reserve` | Reserves stock; mutates in-memory state |
| `GET` | `/inventory/check/:sku` | Read-only stock level lookup |
| `GET` | `/healthz` | Health check |

---

## Fault Injection

Fault injection lets you trigger controlled failures in any service without changing code. It is disabled by default; set `FAULT_INJECTION_ENABLED=true` in a service's env to enable it.

**How it works:**

1. A caller sets the `x-fault-inject` HTTP header on a request to gateway.
2. Gateway's `headerToBaggage` middleware reads the header and writes it as the `fault.inject` W3C baggage key.
3. W3C Baggage propagates automatically with each downstream HTTP call.
4. Each service's `faultInjection` middleware reads the baggage on every incoming request. If the spec's `target` matches the service's own name (`gateway`, `orders`, or `inventory`), the fault fires. Otherwise the request continues normally.

**Spec format:**

```
<target>:<mode>=<value>

Examples:
  orders:latency=2000     inject 2000ms delay into orders
  inventory:error=503     return HTTP 503 from inventory
  gateway:error=500       return HTTP 500 from gateway
```

Modes:
- `latency` — sleeps for `valueMs` before calling `next()`
- `error` — returns the specified HTTP status with `{"error":"fault_injected","spec":"<raw>"}` and short-circuits the handler

---

## Key Span Attributes

Spans are enriched with structured fields at each layer. These are the fields to query in Honeycomb when investigating an incident.

### gateway spans

| Attribute | Type | Notes |
|---|---|---|
| `upstream.reachable` | boolean | `false` if orders threw or timed out |
| `upstream.status` | number | HTTP status returned by orders |
| `order.id` | string | Set on `GET /api/orders/:id` |

### orders spans

| Attribute | Type | Notes |
|---|---|---|
| `sku` | string | |
| `quantity_requested` | number | |
| `validation.ok` | boolean | `false` = bad request body |
| `validation.error` | string | `missing_or_wrong_type` |
| `reservation.ok` | boolean | |
| `reservation.reason` | string | `insufficient`, `unknown_sku`, `invalid_quantity`, `upstream_unavailable` |
| `inventory.stock.after` | number | Remaining stock after successful reservation |
| `order.id` | string | |
| `order.type` | string | `standard`, `express`, or `bulk` |
| `order.status` | string | `created` |

### inventory spans

| Attribute | Type | Notes |
|---|---|---|
| `sku` | string | |
| `quantity_requested` | number | |
| `validation.ok` | boolean | |
| `validation.error` | string | |
| `reservation.ok` | boolean | |
| `reservation.reason` | string | `insufficient`, `unknown_sku`, `invalid_quantity` |
| `inventory.warehouse` | string | e.g. `us-east`, `us-west`, `eu-central` |
| `inventory.stock.before` | number | Stock level before reservation |
| `inventory.stock.after` | number | Stock level after reservation |
| `inventory.found` | boolean | Set on `GET /inventory/check/:sku` |

All services also record unhandled handler exceptions on the active span (via `errorHandler` middleware): `error.type`, `exception.message`, `exception.stacktrace`, and `span.status=ERROR`.

---

## Error Taxonomy

| Error key | HTTP status | Produced by | Meaning |
|---|---|---|---|
| `unknown_sku` | 404 | inventory, orders | SKU not in inventory's seed data |
| `insufficient` | 409 | inventory, orders | Requested quantity exceeds available stock |
| `invalid_quantity` | 400 | inventory, orders | Quantity is not a positive integer |
| `upstream_unavailable` | 502 | orders | inventory HTTP call threw or timed out |
| `orders_unavailable` | 502 | gateway | orders HTTP call threw or timed out |
| `fault_injected` | configurable | any service | Fault injection fired; `spec` field contains the raw spec string |
| `internal_error` | 500 | any service | Unhandled exception caught by `errorHandler` middleware |

---

## Observability Stack

All four services use the same OTel setup:

- **SDK:** `@opentelemetry/sdk-node` with `NodeSDK`
- **Exporter:** `OTLPTraceExporter` → `https://api.honeycomb.io/v1/traces` (configurable via `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`)
- **Processor:** `BatchSpanProcessor`
- **Propagators:** `W3CTraceContextPropagator` + `W3CBaggagePropagator` (composite)
- **Auto-instrumentation:** `getNodeAutoInstrumentations()` with Express middleware/router layers suppressed (to avoid noise spans); route handler spans are emitted
- **Auth:** `x-honeycomb-team: <HONEYCOMB_API_KEY>` header on every export request
- **Resource attributes:** `service.name` (`OTEL_SERVICE_NAME` env var) and `service.version` (`SERVICE_VERSION` build arg)

Telemetry is initialized as the first import in each `server.ts` / `main.ts` (before Express), ensuring instrumentation is registered before any HTTP listeners are set up.

---

## Seeded Inventory

Inventory state is not persistent. On every process start, `seed()` populates the in-memory store with:

| SKU | Warehouse | Initial quantity |
|---|---|---|
| `SKU-A100` | `us-east` | 100,000 |
| `SKU-B200` | `us-west` | 50,000 |
| `SKU-C300` | `eu-central` | 25,000 |

Any SKU outside this list is `unknown_sku`. Stock decrements on each successful reservation and resets only on process restart.

---

## External Integrations

| System | How it's used |
|---|---|
| Honeycomb | Receives all OTel traces via OTLP/HTTP. Primary observability backend. |

No other external systems. There is no database, no message queue, no auth provider, no payment processor, and no cache.

---

## Deployment

**Local (current):**
- `docker compose up` — builds and starts all four services
- Each service is its own Dockerfile under `services/<name>/Dockerfile`
- Boot order is enforced by `depends_on` + `healthcheck` conditions

**Production:**
- Terraform deployment is deferred; not currently implemented
- No CI/CD pipeline in this repository

**Environment configuration:**
- Each service reads its config from a `.env` file (gitignored)
- `.env.example` files ship with each service for quickstart
- Required variables: `HONEYCOMB_API_KEY` (all services), `ORDERS_URL` (gateway), `INVENTORY_URL` (orders), `GATEWAY_URL` (loadgen)
