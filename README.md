# coolify-mcp

MCP server for Coolify, pinned to a specific Coolify OpenAPI version.

## Pinned Coolify version

This repo is pinned to:

- `v4.0.0-beta.460`
- OpenAPI file: `openapi/coolify/v4.0.0-beta.460.json`

## Requirements

- Node 18+
- A Coolify API token

## Install (package)

```bash
npm install -g @fndchagas/coolify-mcp
# or
npx -y @fndchagas/coolify-mcp
```

## Use with Claude Code CLI (stdio)

```bash
claude mcp add coolify \
  --env COOLIFY_BASE_URL="https://coolify.example.com" \
  --env COOLIFY_TOKEN="<token>" \
  -- npx -y @fndchagas/coolify-mcp
```

Optional: disable write tools (deploy/upsert) by adding:

```bash
--env COOLIFY_ALLOW_WRITE=false
```

## Use with OpenAI Codex CLI (stdio)

```bash
codex mcp add coolify \
  --env COOLIFY_BASE_URL="https://coolify.example.com" \
  --env COOLIFY_TOKEN="<token>" \
  -- npx -y @fndchagas/coolify-mcp
```

Or edit `~/.codex/config.toml`:

```toml
[mcp_servers.coolify]
command = "npx"
args = ["-y", "@fndchagas/coolify-mcp"]
env = { COOLIFY_BASE_URL = "https://coolify.example.com", COOLIFY_TOKEN = "<token>" }
```

## Install (dev)

```bash
npm install
```

## Generate types (if OpenAPI changes)

```bash
npm run generate:openapi
```

## Run (stdio)

```bash
COOLIFY_BASE_URL="https://coolify.example.com" \
COOLIFY_TOKEN="<token>" \
MCP_TRANSPORT=stdio \
npm run dev
```

## Run (HTTP)

```bash
COOLIFY_BASE_URL="https://coolify.example.com" \
COOLIFY_TOKEN="<token>" \
MCP_TRANSPORT=http \
PORT=7331 \
npm run dev
```

Endpoint: `POST http://localhost:7331/mcp`

## Run (both)

```bash
MCP_TRANSPORT=both npm run dev
```

## Environment variables

- `COOLIFY_BASE_URL` (required)
- `COOLIFY_TOKEN` (required)
- `COOLIFY_OPENAPI_REF` (default: `v4.0.0-beta.460`)
- `COOLIFY_STRICT_VERSION` (default: `false`)
- `COOLIFY_ALLOW_WRITE` (default: `true`)
- `MCP_TRANSPORT` (`stdio`, `http`, `both`)
- `PORT` (HTTP port, default `7331`)

## Tools

- `coolify.listResources`
- `coolify.getApplication`
- `coolify.listEnvs`
- `coolify.upsertEnv`
- `coolify.deploy`
- `coolify.getDeployment`
- `coolify.getLogs`
- `coolify.listDatabases`
- `coolify.getDatabase`

## MCP usage examples

### HTTP client (Streamable HTTP)

```ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const client = new Client({ name: 'coolify-client', version: '1.0.0' });
const transport = new StreamableHTTPClientTransport(
  new URL('http://localhost:7331/mcp')
);

await client.connect(transport);

const tools = await client.listTools();
console.log(tools.tools.map((t) => t.name));

const resources = await client.callTool({
  name: 'coolify.listResources',
  arguments: {},
});
console.log(resources.structuredContent);

const logs = await client.callTool({
  name: 'coolify.getLogs',
  arguments: { appUuid: 'nwggo800g800oosow8ks4c88' },
});
console.log(logs.structuredContent);

await client.close();
```

### Stdio client (spawn server)

```ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

// Ensure COOLIFY_BASE_URL and COOLIFY_TOKEN are set in the environment
const client = new Client({ name: 'coolify-client', version: '1.0.0' });
const transport = new StdioClientTransport({
  command: 'node',
  args: ['dist/server.js'],
});

await client.connect(transport);

const result = await client.callTool({
  name: 'coolify.getApplication',
  arguments: { uuid: 'nwggo800g800oosow8ks4c88' },
});
console.log(result.structuredContent);

await client.close();
```
