

## INSTALLATION

Create and edit your .env file from the example

```bash
cp .env.example .env
```

Give Oiva access to the Github repo that defines your observed app by including Github PAT(s) in the .env file. If the repo is public you don't need to grant any permissions. More info: [Github Docs.](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens#creating-a-fine-grained-personal-access-token)

Start the OTel Collector

```bash
docker compose up
```

## TROUBLESHOOTING
500 error from webhook endpoint?

```bash
docker compose down -v
npm run db:migrate  # sets up Postgres database
docker compose up
```

### INSTALL MASTRA OTEL EXPORTER

If you receive errors when installing the `@mastra/otel-exporter`, try the `--legacy-peer-deps` flag:

```bash
npm install @mastra/otel-exporter --legacy-peer-deps
```

### Database (local dev)

Start the local Postgres container before running the dev server:

```bash
docker compose up -d postgres
```

### ALERT WEBHOOK PAYLOAD FORMAT

For proper functioning, you must use this alert template!

This alert payload shape is a slightly modified version of the "Generic" Honeycomb (HC)Alert Trigger Template that is provided for HC users who don't know or care about their required payload shape.

This alert includes additional properties that aid our agent in its investigation.

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

More info in the Honeycomb Docs: https://docs.honeycomb.io/notify/webhooks and in the Go Docs, which defines the templating syntax: https://pkg.go.dev/text/template

## Sample alerts

From Astro Shop

```go
{
  "name": "error == true",
  "id": "2XteoXm4S78",
  "description": "",
  "links": {
    "url": "https://ui.honeycomb.io/senorvalenz-gettingstarted/environments/astro-lisa/datasets/frontend/triggers/2XteoXm4S78?utm_content=edit_trigger&utm_medium=Trigger&utm_source=webhook"
  },
  "environment": "astro-lisa",
  "threshold": {
    "op": "greater than",
    "value": "1"
  },
  "result": {
    "groupsTriggered": [
      {
        "count": 2726
      }
    ],
    "links": {
      "url": "https://ui.honeycomb.io/senorvalenz-gettingstarted/environments/astro-lisa/datasets/frontend/result/eLzr7yW3bQq/a/D37zNFYxc7f?utm_content=view_graph&utm_medium=Trigger&utm_source=webhook"
    }
  },
  "alert": {
    "instanceId": "1015bd0f-99a3-41e7-817e-9c831df21262",
    "description": "astro-lisa environment:\nCurrent value (2.726 k) greater than threshold value (1)",
    "status": "TRIGGERED",
    "summary": "TRIGGER TEST: Triggered: error == true",
    "isTest": false
  }
}
```

From Valerie's 3-service app

```go
{
  "name": "Too many HTTP request errors",
  "id": "sbLy6gwM56r",
  "description": "This trigger notifies us if there are any 400 or 500 level HTTP status requests",
  "links": {
    "url": "https://ui.honeycomb.io/vracine-homelab/environments/homelab-env/datasets/gateway/triggers/sbLy6gwM56r?utm_content=edit_trigger&utm_medium=Trigger&utm_source=webhook"
  },
  "environment": "homelab-env",
  "threshold": { "op": "greater than", "value": "0.05" },
  "result": {
    "groupsTriggered": [
      {
        "field": "http.route",
        "value": "/api/orders",
        "count": 0.07634730538922156
      }
    ],
    "links": {
      "url": "https://ui.honeycomb.io/vracine-homelab/environments/homelab-env/datasets/gateway/result/YkMQXZo8Ve/a/CZxFiuoAp5Z?utm_content=view_graph&utm_medium=Trigger&utm_source=webhook"
    }
  },
  "alert": {
    "instanceId": "b67ba3e5-b4b7-40c3-a556-be2a41eb16ac",
    "description": "homelab-env environment:\nCurrently greater than threshold value (0.05) for http.route: /api/orders (value 0.076347)",
    "status": "TRIGGERED",
    "summary": "Triggered: Too many HTTP request errors",
    "isTest": false
  }
}
```
