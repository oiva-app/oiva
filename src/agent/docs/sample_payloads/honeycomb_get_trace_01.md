## raw MCP response

```json
{
  "content": [
    {
      "type": "text",
      "text": "| span_id | parent_id | start_unix_ns | duration_ns | kind | status_code | error | http_status | service | route | name | annotation_type | link_span_id | link_trace_id | depth | child_count | descendant_count | event_count | is_collapsed |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n| 4ce2d70b3f4694c5 |  | 1779315384668999936 | 19954541 | server | ERROR | true | 502 | gateway | /api/orders | POST /api/orders |  |  |  | 0 | 1 | 4 | 0 | false |\n| 36976932b36d2f1c | 4ce2d70b3f4694c5 | 1779315384670000128 | 17953083 | client | ERROR | true | 502 | gateway |  | POST |  |  |  | 1 | 1 | 3 | 0 | false |\n| b430569abd84049f | 36976932b36d2f1c | 1779315384672000000 | 16624417 | server | ERROR | true | 502 | orders | /orders | POST /orders |  |  |  | 2 | 1 | 2 | 0 | false |\n| f79c59fcf3797d72 | b430569abd84049f | 1779315384681999872 | 5284583 | client | ERROR | true | 500 | orders |  | POST |  |  |  | 3 | 1 | 1 | 0 | false |\n| 7098ff00919a4da9 | f79c59fcf3797d72 | 1779315384683000064 | 3754250 | server | ERROR | true | 500 | inventory | /inventory/reserve | POST /inventory/reserve |  |  |  | 4 | 0 | 0 | 0 | false |\n\n\n---\nMetadata:\n  environment: homelab-env\n  mean_sample_rate: 1\n  navigation_hints: Errors detected. Look for spans with error=true or status_code=ERROR for investigation.; Use focus_span_id='4ce2d70b3f4694c5' to examine the slowest span and its children.\n  orphaned_events: 1\n  show_events: true\n  time_range: 86400 seconds\n  total_spans: 5\n  trace_id: b313e5810ee70705a45d6c330bbee342\n  trace_link: \"https://ui.honeycomb.io/vracine-homelab/environments/homelab-env/trace?trace_id=b313e5810ee70705a45d6c330bbee342&trace_start_ts=1779232528&trace_end_ts=1779318928\"\n  trace_result_json: \"https://mcp.honeycomb.io/query_results/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJxdWVyeV9ydW5fcGsiOiJnZlZCZTZLQ1BaZCIsInRlYW1faWQiOjExNjU1OSwidXNlcl9pZCI6MCwiZXhwIjoxNzc5MzE5ODI4LCJpYXQiOjE3NzkzMTg5Mjh9.saM9pWdH7EfctfEwI7ibEjXfgjmhTQg6TfdQltIQpfY\"\n  view_mode: full\n  visible_spans: 5\n"
    },
    {
      "name": "Trace spans for b313e5810ee70705a45d6c330bbee342 (raw JSON)",
      "uri": "honeycomb://trace/gfVBe6KCPZd/json",
      "mimeType": "application/json",
      "type": "resource_link"
    }
  ]
}
```

## prettified table

| span_id | parent_id | start_unix_ns | duration_ns | kind | status_code | error | http_status | service | route | name | annotation_type | link_span_id | link_trace_id | depth | child_count | descendant_count | event_count | is_collapsed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 4ce2d70b3f4694c5 |  | 1779315384668999936 | 19954541 | server | ERROR | true | 502 | gateway | /api/orders | POST /api/orders |  |  |  | 0 | 1 | 4 | 0 | false |
| 36976932b36d2f1c | 4ce2d70b3f4694c5 | 1779315384670000128 | 17953083 | client | ERROR | true | 502 | gateway |  | POST |  |  |  | 1 | 1 | 3 | 0 | false |
| b430569abd84049f | 36976932b36d2f1c | 1779315384672000000 | 16624417 | server | ERROR | true | 502 | orders | /orders | POST /orders |  |  |  | 2 | 1 | 2 | 0 | false |
| f79c59fcf3797d72 | b430569abd84049f | 1779315384681999872 | 5284583 | client | ERROR | true | 500 | orders |  | POST |  |  |  | 3 | 1 | 1 | 0 | false |
| 7098ff00919a4da9 | f79c59fcf3797d72 | 1779315384683000064 | 3754250 | server | ERROR | true | 500 | inventory | /inventory/reserve | POST /inventory/reserve |  |  |  | 4 | 0 | 0 | 0 | false |