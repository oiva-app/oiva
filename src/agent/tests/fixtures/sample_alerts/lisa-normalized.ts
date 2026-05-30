export const lisaExpected = {
  status: "TRIGGERED",
  isTest: false,
  triggerName: "error == true",
  description: "COUNT of error = true >= 1 over the course of 5 minutes",
  environment: "astro-lisa",
  datasets: ["__all__"],
  groupsTriggered: [
    { field: "service.name", value: "product-catalog", count: 2736 },
    { field: "service.name", value: "frontend", count: 2734 },
    { field: "service.name", value: "frontend-proxy", count: 684 },
    { field: "service.name", value: "ad", count: 9 },
    { field: "service.name", value: "fraud-detection", count: 9 },
    { field: "service.name", value: "load-generator", count: 4 },
  ],
  alert: { timestamp: "May 18 2026 13:21:03 UTC-04:00" },
  resultUrl:
    "https://ui.honeycomb.io/senorvalenz-gettingstarted/environments/astro-lisa/result/4SSzmNoFT8d?utm_content=view_graph&utm_medium=Trigger&utm_source=webhook",
  triggerUrl:
    "https://ui.honeycomb.io/senorvalenz-gettingstarted/environments/astro-lisa/triggers/2XteoXm4S78?utm_content=edit_trigger&utm_medium=Trigger&utm_source=webhook",
  instanceId: "1015bd0f-99a3-41e7-817e-9c831df21262",
};
