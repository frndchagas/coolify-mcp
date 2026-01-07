# coolify-mcp

MCP server for Coolify API.

## Pinned Coolify Version

Version is defined in `src/coolify/constants.ts`. To update:

1. Edit `COOLIFY_VERSION` in `src/coolify/constants.ts`
2. Run `npm run update`

## Requirements

- Node 18+
- A Coolify API token

## Install

```bash
npm install -g @fndchagas/coolify-mcp
# or
npx -y @fndchagas/coolify-mcp
```

## Use with Claude Code CLI

```bash
claude mcp add coolify \
  --env COOLIFY_BASE_URL="https://coolify.example.com" \
  --env COOLIFY_TOKEN="<token>" \
  -- npx -y @fndchagas/coolify-mcp
```

Disable write tools (deploy/env mutations):

```bash
--env COOLIFY_ALLOW_WRITE=false
```

## Use with OpenAI Codex CLI

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

## Development

```bash
npm install
npm run dev
```

## Scripts

```bash
npm run dev            # Run in development mode
npm run build          # Build TypeScript
npm run generate       # Regenerate types from OpenAPI
npm run fetch:openapi  # Fetch latest OpenAPI spec
npm run update         # Fetch + regenerate
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `COOLIFY_BASE_URL` | required | Coolify API URL |
| `COOLIFY_TOKEN` | required | API token |
| `COOLIFY_STRICT_VERSION` | `false` | Fail on version mismatch |
| `COOLIFY_ALLOW_WRITE` | `true` | Enable write operations |
| `MCP_TRANSPORT` | `stdio` | Transport: `stdio`, `http`, `both` |
| `PORT` | `7331` | HTTP port |

## Tools

- `coolify.listResources`
- `coolify.listApplications`
- `coolify.getApplication`
- `coolify.getLogs`
- `coolify.listEnvs`
- `coolify.createEnv`
- `coolify.updateEnv`
- `coolify.deploy`
- `coolify.getDeployment`
- `coolify.listDatabases`
- `coolify.getDatabase`

## MCP Usage Examples

### HTTP Client

```ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const client = new Client({ name: 'coolify-client', version: '1.0.0' });
const transport = new StreamableHTTPClientTransport(
  new URL('http://localhost:7331/mcp')
);

await client.connect(transport);

const resources = await client.callTool({
  name: 'coolify.listResources',
  arguments: {},
});
console.log(resources.structuredContent);

await client.close();
```

### Stdio Client

```ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const client = new Client({ name: 'coolify-client', version: '1.0.0' });
const transport = new StdioClientTransport({
  command: 'node',
  args: ['dist/server.js'],
});

await client.connect(transport);

const result = await client.callTool({
  name: 'coolify.getApplication',
  arguments: { uuid: 'your-app-uuid' },
});
console.log(result.structuredContent);

await client.close();
```
