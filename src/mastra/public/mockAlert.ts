export const alert = {
  "name": "Too many HTTP request errors",
  "id": "sbLy6gwM56r",
  "description": "This trigger notifies us if there are any 400 or 500 level HTTP status requests",
  "links": {
    "url": "https://ui.honeycomb.io/vracine-homelab/environments/homelab-env/datasets/gateway/triggers/sbLy6gwM56r?utm_content=edit_trigger&utm_medium=Trigger&utm_source=webhook"
  },
  "environment": "homelab-env",
  "threshold": {
    "op": "greater than",
    "value": "0.1"
  },
  "result": {
    "groupsTriggered": [
      {
        "field": "http.route",
        "value": "/api/orders",
        "count": 1
      }
    ],
    "links": {
      "url": "https://ui.honeycomb.io/vracine-homelab/environments/homelab-env/datasets/gateway/result/4cyiskbS8py/a/Aox3eDb6T5i?utm_content=view_graph&utm_medium=Trigger&utm_source=webhook"
    }
  },
  "alert": {
    "instanceId": "534bcf91-8070-41ec-808b-abe472a239e7",
    "description": "homelab-env environment:\nCurrently greater than threshold value (0.1) for http.route: /api/orders (value 1)",
    "status": "TRIGGERED",
    "summary": "Triggered: Too many HTTP request errors",
    "isTest": false
  }
}
