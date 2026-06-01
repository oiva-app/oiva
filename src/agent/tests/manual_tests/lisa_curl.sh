curl -i -X POST http://localhost:4111/hook/honeycomb/alert \
  -H "Content-Type: application/json" \
  -d '{
        "name": "error == true",
        "id": "2XteoXm4S78",
        "description": "COUNT of error = true >= 1 over the course of 5 minutes",
        "links": {
            "url": "https://ui.honeycomb.io/senorvalenz-gettingstarted/environments/astro-lisa/triggers/2XteoXm4S78?utm_content=edit_trigger&utm_medium=Trigger&utm_source=webhook"
        },
        "environment": "astro-lisa",
        "threshold": {
            "op": "greater than",
            "value": "1"
        },
        "datasets": ["__all__"],
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
            "url": "https://ui.honeycomb.io/senorvalenz-gettingstarted/environments/astro-lisa/result/HwVZ4E1hbwr?utm_content=view_graph&utm_medium=Trigger&utm_source=webhook"
            }
        },
        "alert": {
            "instanceId": "3015bd0f-99a3-41e7-817e-9c831df21262",
            "description": "astro-lisa environment:\nCurrent value (6.176 k) greater than threshold value (1)",
            "status": "TRIGGERED",
            "summary": "Triggered: error == true",
            "timestamp": "May 18 2026 13:21:03 UTC-04:00",
            "isTest": false
        }
    }'