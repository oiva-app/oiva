# Oiva

[![tests badge](https://github.com/oiva-app/oiva/actions/workflows/node.js.yml/badge.svg)](https://github.com/oiva-app/oiva/actions/workflows/node.js.yml)

> Oiva is a self-hosted, open-source service for AI-assisted incident investigation.

Oiva receives Honeycomb alert webhooks and runs an automated investigation,
combining observability data with read access to the GitHub repositories that
define your observed app.

## Prerequisites

Oiva needs credentials for a few external services before it can run. Obtain these regardless of how you run Oiva: for local development put them in your
`.env` (see [local development](docs/local-dev.md)); for production store them in AWS Secrets Manager (see the [deployment guide](terraform/README.md)).

### LLM provider

Oiva's agents call an LLM provider. The default models are OpenAI, so by default you need an **`OPENAI_API_KEY`**. Mastra reads provider-standard variables automatically — if you configure non-OpenAI models, set that provider's key as well: `anthropic/...` models use `ANTHROPIC_API_KEY`, `google/...` models use
`GOOGLE_API_KEY`.

### Honeycomb

- **MCP key** (`HONEYCOMB_MCP_KEY`) — a Team-level key with read-only Environments and MCP access, in `key_id:key_secret` format. The telemetry agent uses it to query your data. See the [Honeycomb MCP guide](https://docs.honeycomb.io/integrations/mcp/configuration-guide).
- **Alert webhook** — add a webhook recipient that POSTs to Oiva at `/hook/honeycomb/alert`, using the payload template in [Alert webhook payload format](#alert-webhook-payload-format). In production, set a shared secret (`HONEYCOMB_SHARED_SECRET`). Oiva rejects requests whose secret doesn't match. The secret may be supplied either as the `X-Honeycomb-Webhook-Token` header or as the `secret` field in the payload body (the template uses the body field); the header takes precedence if both are present. `HONEYCOMB_SHARED_SECRET` is optional in development and required in production.

### Slack

Oiva posts incident reports and live updates to a Slack channel. Create a Slack app for your workspace and:

- Add the **`chat:write`** bot scope, install the app, and copy the **Bot User OAuth token** (`SLACK_BOT_TOKEN`).
- Copy the app's **Signing secret** (`SLACK_SIGNING_SECRET`) — used to verify Slack interactions, like user ratings and incident retries.
- Enable **Interactivity** and set the request URL to Oiva at `/hook/slack/interaction`.
- Invite the bot to the target channel and copy its **channel ID** (`SLACK_CHANNEL_ID`).

### GitHub

- A **personal access token** (`GITHUB_PAT`) with read access to the repositories Oiva should inspect. Public repos need no scopes.
- The repositories themselves, as JSON in `APP_GITHUB_REPOSITORIES`, e.g. `[{"name":"example-app","url":"https://github.com/example/repo.git"}]`.

## Deployment

To self-host Oiva in production on AWS (ECS/Fargate) with Terraform, see the
**[deployment guide](terraform/README.md)**.

## Local development

See **[docs/local-dev.md](docs/local-dev.md)** for setup, running the dev
server, and troubleshooting.

## Alert webhook payload format

For proper functioning, you must use this Honeycomb webhook template.

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
- `app.incident.id` (groups every span in one investigation)
- `app.alert.trigger_name`
- `app.alert.dataset`

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
