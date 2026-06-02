# Isolated HTTP Error on /api/orders Route · homelab-env

## Summary
A Honeycomb trigger fired for the `gateway` dataset on route `/api/orders`, but the available evidence points to a single isolated HTTP error rather than a sustained incident. The saved trigger result shows one erroring event in a 15-minute window, and follow-up telemetry could not find retained raw events or traces for the request, so current severity appears low and possibly already resolved.

## Alert Overview
[WIP]
The alert monitors HTTP request errors (4xx/5xx) for the `gateway` dataset, triggering when there is any error for the `/api/orders` route. The trigger fired on `2026-05-22T00:00:00Z` with a single recorded error event. [View in Honeycomb](https://ui.honeycomb.io/vracine-homelab/environments/homelab-env/datasets/gateway/result/4cyiskbS8py/a/Aox3eDb6T5i?utm_content=view_graph&utm_medium=Trigger&utm_source=webhook).
[/WIP]

## Hypothesis
A single request to `gateway` route `/api/orders` returned a 4xx/5xx response, causing the alert to fire because the trigger is configured to notify on any HTTP error for that route group. The likely service path is `gateway -> orders`, but because the raw event and trace are no longer available and code inspection found no route-specific regression, the available evidence is insufficient to determine whether the cause was an application bug, transient dependency issue, or a one-off bad request.
- **Supporting evidence**
  - Telemetry: the saved Honeycomb trigger result shows `http.route=/api/orders` with error ratio `1.0`, representing 1 erroring event in the evaluated 15-minute window.
  - Telemetry: follow-up queries found no retained matching rows for `/api/orders` and no retrievable error sample or trace, which supports this being a one-off or no-longer-visible event rather than an ongoing spike.
  - Codebase: the route most likely maps to the `gateway` service in `oiva-app/three-services-demo-app`, which proxies `POST /api/orders` to the `orders` service.
  - Codebase: recent commits before the incident window were a Docker/containerization change (`7bbede4`, 2026-05-20) and an observability/error-handler change (`cf52cda`, 2026-05-20`), with no direct changes found to `/api/orders` routing logic or order creation behavior.
- **Against / ruled out**
  - Telemetry: no evidence of sustained elevated errors across gateway routes or an ongoing `/api/orders` failure was found in the currently queryable data.
  - Telemetry: exact HTTP status code, request method, client identity, downstream target, and trace ID could not be recovered, so there is no direct evidence for an external dependency, infrastructure fault, or specific application exception.
  - Codebase: no recent deployment or code change was identified that directly touched `/api/orders`, gateway routing for that endpoint, or the order handler in a way that strongly explains new 4xx/5xx responses.
  - Telemetry: the alert payload timestamp (`2026-05-22T00:00:00Z`) did not match the saved trigger result’s apparent time range (around `2026-05-13T18:53Z-18:56Z`), which reduces confidence in precise correlation.


## Next Steps
**Immediate**  
- Open the Honeycomb result URL and verify the trigger query time range, especially the mismatch between the alert payload timestamp and the saved result window.  
  Rationale: Resolving the timestamp discrepancy is necessary before correlating the event to deployments or user activity.  

**Short-term**  
- In Honeycomb, run a fresh query on `gateway` for the last 7-30 days filtered to `http.route=/api/orders` and broken down by `http.status_code`, method, and any downstream/upstream service fields.  
  Rationale: This will show whether `/api/orders` errors recur and whether the problem is client-side (4xx), server-side (5xx), or tied to a specific dependency path.  
- If errors recur, retrieve a representative trace immediately and inspect the `gateway -> orders` path for the failing request.  
  Rationale: The current investigation was blocked by missing retained raw events; capturing a live recurrence is the fastest way to identify origin.  

**Follow-up**  
- Review the `gateway` and `orders` services around the `/api/orders` -> `POST /orders` path, including any generic error handling introduced by commit `cf52cda`.  
  Rationale: Although no direct route regression was found, generic error-handler changes can alter surfaced HTTP status behavior without changing business logic.

## Investigation Steps
[WIP]
_Investigation trace not yet available._
```
[
    {
        summary: I want to check if blah blah
        tool_call: { ... }
        tool_result: { ... }
        query_url: http://honeycomb.io/results/2je03kso
    }
]
```

[/WIP]
