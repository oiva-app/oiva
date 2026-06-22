## Intro
This note describes how to run tests with the Oiva fork of the OTel Astronomy Shop app.  First, you should use that README (https://github.com/oiva-app/opentelemetry-demo) to get up and running.  You can then return to this README in order to inject code bugs.

## Code failure injection
> [!NOTE]
> It would be more convenient to provide this documentation inside the Oiva fork of the Astronomy Shop.  However, this has the potential to create an unrealistic testing environment for Oiva, since it would be able to access descriptions of the bugs that we want to test it against.

In addition to the feature-flags provided in the upstream repo, the Oiva fork provides a couple of code-level faults that you can inject into your telemetry and diagnose with Oiva.  They are codenamed to obscure the true nature of the bugs from Oiva.  In addition to lines that were changed to introduce bugs, additional lines were modified in an attempt to obscure the cause of the bug.

### Running a test
Run the app with the `main` branch to record a minimum of ~20 minutes of 'good' telemetry in your Observability platform.
```
git switch main
make start
```

**Deploy the buggy code:** switch to the branch that contains the buggy 'production' code, e.g.:
```
git switch lisa-prod
```

You still need to 'deploy' the buggy code to 'production'.

A single service can be redeployed via `make redeploy`, e.g.:
```
make redeploy service=recommendation
```
The above method is usually best, as it is quick and shows minimal downtime in the telemetry.

You can also rebuild the entire application, although this will take significantly longer and your telemetry will show significant downtime:
```
make build && make restart
```

At this point, the application should be sending telemetry to your observability backend that exhibits the bug that the code intends to simulate.
### The bugs
All bugs are listed below.  Each bug has a `-dev` branch, which was used to modify the code, and a `-prod` branch which is used to 'deploy' the bug
#### lisa
##### Summary
Recommendation service returns invalid product IDs, causing errors elsewhere in the system.  Simulates a change in a naming convention that was not propagated to nearby services.
##### Details
**File affected:** 
```
recommendation/recommendation_server.py
```

Here’s the bug, prepending the id with `#`:
```python
product_ids = [f"#{x.id}" for x in cat_response.products]
```

##### Example alert webhook
```json fold
{
  "name": "error == true",
  "id": "2XteoXm4S78",
  "description": "COUNT of error = true >= 1 over the course of 5 minutes",
  "links": {
    "url": "https://ui.honeycomb.io/senorvalenz-gettingstarted/environments/astro-lisa/triggers/2XteoXm4S78?utm_content=edit_trigger&utm_medium=Trigger&utm_source=webhook"
  },
  "environment": "astro-lisa",
  "threshold": {
    "op": "greater than",
    "value": 1
  },
  "datasets": [
    "__all__"
  ],
  "result": {
    "groupsTriggered": [
      {
        "field": "service.name",
        "value": "product-catalog",
        "count": 2736
      },
      {
        "field": "service.name",
        "value": "frontend",
        "count": 2734
      },
      {
        "field": "service.name",
        "value": "frontend-proxy",
        "count": 684
      },
      {
        "field": "service.name",
        "value": "ad",
        "count": 9
      },
      {
        "field": "service.name",
        "value": "fraud-detection",
        "count": 9
      },
      {
        "field": "service.name",
        "value": "load-generator",
        "count": 4
      }
    ],
    "links": {
      "url": "https://ui.honeycomb.io/senorvalenz-gettingstarted/environments/astro-lisa/result/4SSzmNoFT8d?utm_content=view_graph&utm_medium=Trigger&utm_source=webhook"
    }
  },
  "alert": {
    "instanceId": "1015bd0f-99a3-41e7-817e-9c831df21262",
    "description": "astro-lisa environment:\nCurrent value (6.176 k) greater than threshold value (1)",
    "status": "TRIGGERED",
    "summary": "Triggered: error == true",
    "timestamp": "May 18 2026 13:21:03 UTC-04:00",
    "isTest": false,
    "secret": "letmein"
  }
}
```
#### wiggum
##### Summary
Simulates a change in the API that was executed on one service but not propagated to nearby services.

##### Details
The next app requests images from the `image-provider` service, which is an Nginx container.  This code change requests images from a path on the server that does not exist.  

Files affected:
```
frontend/pages/product/[productId]/index.tsx
```

Change line 78 from:
```
$src={`/images/products/${picture}`}  
```
to  
```
$src={`/assets/products/${picture}`}
```

##### Example alert webhook
```json fold
{
  "name": "Excess 4xx HTTP Status Codes",
  "id": "9G1ViaHDAar",
  "description": "A higher-than normal number of 4xx status codes are firing",
  "links": {
    "url": "https://ui.honeycomb.io/senorvalenz-gettingstarted/environments/astro-lisa/triggers/9G1ViaHDAar?utm_content=edit_trigger&utm_medium=Trigger&utm_source=webhook"
  },
  "environment": "astro-lisa",
  "threshold": {
    "op": "greater than",
    "value": 20
  },
  "datasets": [
    "unknown_metrics",
    "otelcol-contrib",
    "product-catalog",
    "checkout",
    "cart",
    "kafka",
    "accounting",
    "recommendation",
    "payment",
    "load-generator",
    "frontend-proxy",
    "image-provider",
    "ad",
    "currency",
    "product-reviews",
    "frontend-web",
    "frontend",
    "quote",
    "shipping",
    "email",
    "fraud-detection"
  ],
  "result": {
    "groupsTriggered": [
      {
        "field": "service.name",
        "value": "frontend",
        "count": 65
      },
      {
        "field": "service.name",
        "value": "frontend-proxy",
        "count": 62
      }
    ],
    "links": {
      "url": "https://ui.honeycomb.io/senorvalenz-gettingstarted/environments/astro-lisa/result/5CYtgUbpdT/a/DoxFDWn9eJE?utm_content=view_graph&utm_medium=Trigger&utm_source=webhook"
    }
  },
  "alert": {
    "instanceId": "4df64857-9529-421b-9094-9202025638fd",
    "description": "astro-lisa environment:\nCurrently greater than threshold value (20) for service.name: frontend (value 65), service.name: frontend-proxy (value 62)",
    "status": "TRIGGERED",
    "summary": "Triggered: Excess 4xx HTTP Status Codes",
    "timestamp": "2026-05-28 16:28:18.376867679 +0000 UTC",
    "isTest": false
  },
  "secret": "letmein"
}
```

