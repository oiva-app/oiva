https://mastra.ai/docs/agents/overview


## Give agent MCP
```ts
// https://mastra.ai/docs/mcp/overview
import { MCPClient } from '@mastra/mcp'

export const testMcpClient = new MCPClient({
  id: 'test-mcp-client',
  servers: {
    wikipedia: {
      command: 'npx',
      args: ['-y', 'wikipedia-mcp'],
    },
    weather: {
      url: new URL(
        `https://server.smithery.ai/@smithery-ai/national-weather-service/mcp?api_key=${process.env.SMITHERY_API_KEY}`,
      ),
    },
  },
})
```

```ts
import { Agent } from '@mastra/core/agent'
import { testMcpClient } from '../mcp/test-mcp-client'

export const testAgent = new Agent({
  id: 'test-agent',
  name: 'Test Agent',
  description: 'You are a helpful AI assistant',
  instructions: `
      You are a helpful assistant that has access to the following MCP Servers.
      - Wikipedia MCP Server
      - US National Weather Service

      Answer questions using the information you find using the MCP Servers.`,
  model: 'openai/gpt-5.4',
  tools: await testMcpClient.listTools(),
})
```
## GIT STUFF


Co-authored-by: Tiia Rikama <tiiarikama@users.noreply.github.com>
Co-authored-by: Jonathan McNair <unlikelykoala@users.noreply.github.com>
Co-authored-by: Valerie Racine <v-racine@users.noreply.github.com>



## MCP
### What does the agent see when it queries `honeycomb_workspace_context`?
```
{
  "content": [
    {
      "type": "text",
      "text": "HONEYCOMB WORKSPACE CONTEXT
        ============================

        TEAM INFORMATION
        ----------------
        Name: vracine-homelab
        Slug: vracine-homelab

        CURRENT TIME
        ------------
        Epoch: 1778788851
        Human: 2026-05-14 20:00:51 UTC

        ENVIRONMENTS
        ------------
        <env>
        Name: homelab-env
        Slug: homelab-env
        Dataset Count: 4
        </env>



        SEMANTIC CONVENTION NAMESPACES
        -------------------------------
        The semconv registry covers these attribute namespaces. Use search_semconv or get_semconv_attribute
        to look up attribute definitions when constructing queries or interpreting column names.
        Namespaces: android, app, artifact, aspnetcore, audio, aws, az, azure, body, browser, cassandra, cicd, client, cloud, cloudevents, cloudfoundry, cls, code, container, cpu, cpython, dataset, db, deployment, destination, device, disk, dns, document, dotnet, duration_ms, elasticsearch, embedding, enduser, entry_page, environment, error, event, exception, faas, fcp, feature_flag, file, flags, gcp, gen_ai, geo, go, graphql, heroku, honeycomb, host, http, hw, image, inp, input, ios, jsonrpc, jvm, k8s, kestrel, lcp, library, linux, llm, log, mainframe, mcp, message, messaging, meta, name, net, network, nfs, nodejs, oci, onc_rpc, openai, openinference, openshift, opentracing, oracle, oracle_cloud, os, otel, output, page, peer, pool, pprof, process, profile, prompt, reranker, retrieval, rpc, security_rule, server, service, session, severity, severity_code, severity_text, signalr, source, span, state, status_code, system, team, telemetry, test, thread, tls, tool, trace, traceloop, ttfb, type, url, user, user_agent, v8js, vcs, webengine, zos


        NEXT STEP
        ---------
        Use 'get_environment' with an environment_slug to populate environment and dataset context.

        "
    }
  ]
}
```
Mastra HTTP server
https://mastra.ai/docs/server/mastra-server 



## alert
{"name":"Too many HTTP request errors","id":"sbLy6gwM56r","description":"This trigger notifies us if there are any 400 or 500 level HTTP status requests","links":{"url":"https://ui.honeycomb.io/vracine-homelab/environments/homelab-env/datasets/gateway/triggers/sbLy6gwM56r?utm_content=edit_trigger&utm_medium=Trigger&utm_source=webhook"},"environment":"homelab-env","threshold":{"op":"greater than","value":"0.05"},"result":{"groupsTriggered":[{"field":"http.route","value":"/api/orders","count":0.07634730538922156}],"links":{"url":"https://ui.honeycomb.io/vracine-homelab/environments/homelab-env/datasets/gateway/result/YkMQXZo8Ve/a/CZxFiuoAp5Z?utm_content=view_graph&utm_medium=Trigger&utm_source=webhook"}},"alert":{"instanceId":"b67ba3e5-b4b7-40c3-a556-be2a41eb16ac","description":"homelab-env environment:\nCurrently greater than threshold value (0.05) for http.route: /api/orders (value 0.076347)","status":"TRIGGERED","summary":"Triggered: Too many HTTP request errors","isTest":false}}
