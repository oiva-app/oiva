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

## INSTALL MASTRA OTEL EXPORTER
npm install @mastra/otel-exporter --legacy-peer-deps