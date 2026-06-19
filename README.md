# Oiva

[![tests badge](https://github.com/oiva-app/oiva/actions/workflows/node.js.yml/badge.svg)](https://github.com/oiva-app/oiva/actions/workflows/node.js.yml)

> Oiva is a self-hosted, open-source service for AI-assisted incident investigation.

Oiva receives Honeycomb alert webhooks and runs an automated investigation,
combining observability data with read access to the GitHub repositories that
define your observed app.

## Deployment

To self-host Oiva in production on AWS (ECS/Fargate) with Terraform, see the
**[deployment guide](terraform/README.md)**.

## Local development

See **[docs/local-dev.md](docs/local-dev.md)** for setup, running the dev
server, and troubleshooting.

## Alert webhook payload format

For proper functioning, you must use this alert template.

This payload shape is a slightly modified version of the "Generic" Honeycomb
Alert Trigger Template (provided for Honeycomb users who don't know or care
about their required payload shape). It includes additional properties that aid
the agent in its investigation.

```go
{
  "name": "{{ .Name }}",
  "id": "{{ .ID }}",
  "description": "{{ .Description }}",
  "links": {
    "url": "{{ .URL }}"
  },
  "environment": "{{ .Environment }}",
  "threshold": {
    "op": "{{ .Operator }}",
    "value": "{{ .Threshold }}"
  },
  "datasets": {{ toJson .Datasets }},
  "result": {
    "groupsTriggered": [
      {{- $numGroups := len .Result.GroupsTriggered -}}
      {{ range $i, $group := .Result.GroupsTriggered -}}
        {{- if $i -}},{{ end -}}{
          {{ range $g := .Group -}}
          "field": "{{ $g.Key }}",
          "value": {{ printf "%#v" $g.Value }},
          {{ end -}}
          "count": {{ .Result }}
        }
      {{- end }}
    ],
    "links": {
      "url": "{{ .Result.URL }}"
    }
  },
  "alert": {
    "instanceId": "{{ .Alert.InstanceID }}",
    "description": "{{ .Alert.Description }}",
    "status": "{{ .Alert.Status }}",
    "summary": "{{ .Alert.Summary }}",
    "timestamp": "{{ .Alert.Timestamp }}",
    "isTest": {{ .Alert.IsTest }}
  },
  "secret": "{{.Recipient.Secret}}"
}
```

More info: [Honeycomb webhooks docs](https://docs.honeycomb.io/notify/webhooks)
and the [Go text/template docs](https://pkg.go.dev/text/template) for the
templating syntax.

### Sample alerts

Sample alert payloads live in
[src/agent/tests/fixtures/sample_alerts/](src/agent/tests/fixtures/sample_alerts/),
and runnable `curl` examples are in
[src/agent/tests/manual_tests/](src/agent/tests/manual_tests/).

## Observing Oiva with an OTel frontend (e.g. Honeycomb)

### Notable span attributes

Trying to understand what Oiva did? When viewing a trace, show these span
attributes as columns in your trace view:

- `gen_ai.operation.name`
- `mastra.workflow_step.input`
- `gen_ai.tool.name`
- `mastra.model_step.input` and `.output` (agent LLM inputs and outputs)

### Model inputs and outputs

When viewing `mastra.model_step.input` / `.output`, note that you are **not**
seeing the exact data sent to the LLM API — Mastra redacts tool calls. The
shape looks like:

```json
[
  { "role": "system", "content": "..." },
  {
    "role": "system",
    "content": "Local filesystem at \"/.../knowledge-base\". Relative paths resolve from this directory. File access is restricted to this directory."
  },
  { "role": "user", "content": { "omittedForBrevity": "raw alert is here" } },
  { "role": "assistant", "content": "[tool: agent-telemetryAgent]" },
  { "role": "tool", "content": "[tool: agent-telemetryAgent]" }
]
```

## Documentation

- [Deployment (AWS + Terraform)](terraform/README.md)
- [Local development](docs/local-dev.md)
- [Oiva agent overview](docs/oiva-agent.md)
- [Fault-injection: Three-Services Demo](docs/three-services-fault-injection.md)
- [Fault-injection: OTel Astro Shop Demo](docs/otel-astro-shop-fault-injection.md)
