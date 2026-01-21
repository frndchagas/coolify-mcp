# coolify-mcp

[![npm version](https://img.shields.io/npm/v/@fndchagas/coolify-mcp.svg)](https://www.npmjs.com/package/@fndchagas/coolify-mcp)
[![npm downloads](https://img.shields.io/npm/dm/@fndchagas/coolify-mcp.svg)](https://www.npmjs.com/package/@fndchagas/coolify-mcp)
[![license](https://img.shields.io/npm/l/@fndchagas/coolify-mcp.svg)](LICENSE)
[![node version](https://img.shields.io/node/v/@fndchagas/coolify-mcp.svg)](package.json)
[![typescript](https://img.shields.io/badge/TypeScript-5.9.3-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![CI](https://github.com/frndchagas/coolify-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/frndchagas/coolify-mcp/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/frndchagas/coolify-mcp/branch/main/graph/badge.svg)](https://codecov.io/gh/frndchagas/coolify-mcp)

MCP server for Coolify API - enables full deployment workflows from zero to production.

## Features

- **Full Deployment Workflow**: Create projects, environments, servers, and applications from scratch
- **6 Application Types**: Public git, GitHub App, Deploy Key, Dockerfile, Docker Image, Docker Compose
- **Environment Management**: Full CRUD for environment variables with secret masking
- **Deployment Control**: Deploy, start, stop, restart applications
- **Security**: Write protection, secret redaction, log sanitization
- **38 Tools**: Complete coverage of Coolify API operations

## Requirements

- Node 18+
- A Coolify API token (Settings > API in your Coolify dashboard)

## Install

```bash
npm install -g @fndchagas/coolify-mcp
# or
npx -y @fndchagas/coolify-mcp
```

## Quick Start

### Claude Code CLI

```bash
claude mcp add coolify \
  --env COOLIFY_BASE_URL="https://coolify.example.com/api/v1" \
  --env COOLIFY_TOKEN="<token>" \
  -- npx -y @fndchagas/coolify-mcp
```

### OpenAI Codex CLI

```bash
codex mcp add coolify \
  --env COOLIFY_BASE_URL="https://coolify.example.com/api/v1" \
  --env COOLIFY_TOKEN="<token>" \
  -- npx -y @fndchagas/coolify-mcp
```

Or edit `~/.codex/config.toml`:

```toml
[mcp_servers.coolify]
command = "npx"
args = ["-y", "@fndchagas/coolify-mcp"]
env = { COOLIFY_BASE_URL = "https://coolify.example.com/api/v1", COOLIFY_TOKEN = "<token>" }
```

### Manual Configuration (`~/.mcp.json`)

```json
{
  "mcpServers": {
    "coolify": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@fndchagas/coolify-mcp"],
      "env": {
        "COOLIFY_BASE_URL": "https://coolify.example.com/api/v1",
        "COOLIFY_TOKEN": "<token>",
        "COOLIFY_ALLOW_WRITE": "true"
      }
    }
  }
}
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `COOLIFY_BASE_URL` | required | Coolify API URL (e.g., `https://coolify.example.com/api/v1`) |
| `COOLIFY_TOKEN` | required | API token from Coolify Settings > API |
| `COOLIFY_ALLOW_WRITE` | `true` | Enable write operations (create, update, delete, deploy) |
| `COOLIFY_ALLOW_UNSAFE_LOGS` | `false` | Allow raw logs without redaction |
| `COOLIFY_STRICT_VERSION` | `false` | Fail on API version mismatch |
| `MCP_TRANSPORT` | `stdio` | Transport: `stdio`, `http`, `both` |
| `PORT` | `7331` | HTTP port (when using http transport) |

## Deploy from Zero

With this MCP, you can deploy an application from scratch:

```
1. listProjects / createProject       → Get or create a project
2. listEnvironments / createEnvironment → Get or create an environment
3. listServers / createServer         → Get or create a server
4. listPrivateKeys / createPrivateKey → Get or create SSH keys (if needed)
5. createPublicApplication            → Create the application
6. upsertEnv                          → Configure environment variables
7. deploy                             → Trigger deployment
```

## Tools Reference

### Projects & Environments

| Tool | Description | Write |
|------|-------------|-------|
| `listProjects` | List all projects | |
| `createProject` | Create a new project | ✓ |
| `updateProject` | Update project name/description | ✓ |
| `deleteProject` | Delete a project and all its resources | ✓ |
| `listEnvironments` | List environments in a project | |
| `createEnvironment` | Create a new environment | ✓ |

### Servers & Infrastructure

| Tool | Description | Write |
|------|-------------|-------|
| `listServers` | List all servers | |
| `getServer` | Get server details | |
| `createServer` | Create a new server | ✓ |
| `validateServer` | Validate server connection | |
| `listPrivateKeys` | List SSH private keys | |
| `createPrivateKey` | Create a new SSH key | ✓ |
| `listGithubApps` | List configured GitHub Apps | |

### Applications - Read

| Tool | Description |
|------|-------------|
| `listApplications` | List all applications (summarized by default) |
| `getApplication` | Get application details (secrets masked by default) |
| `getLogs` | Get application runtime logs |

### Applications - Create

| Tool | Description | Write |
|------|-------------|-------|
| `createPublicApplication` | Create from public git repository | ✓ |
| `createPrivateGithubAppApplication` | Create using GitHub App | ✓ |
| `createPrivateDeployKeyApplication` | Create using SSH deploy key | ✓ |
| `createDockerfileApplication` | Create from Dockerfile content | ✓ |
| `createDockerImageApplication` | Create from Docker image | ✓ |
| `createDockerComposeApplication` | Create from Docker Compose | ✓ |

### Applications - Manage

| Tool | Description | Write |
|------|-------------|-------|
| `updateApplication` | Update application configuration | ✓ |
| `deleteApplication` | Delete an application | ✓ |
| `startApplication` | Start an application | ✓ |
| `stopApplication` | Stop an application | ✓ |
| `restartApplication` | Restart an application | ✓ |

### Environment Variables

| Tool | Description | Write |
|------|-------------|-------|
| `listEnvs` | List env vars (secrets masked by default) | |
| `createEnv` | Create a new env var | ✓ |
| `upsertEnv` | Create or update env var by key | ✓ |
| `updateEnv` | Update an existing env var | ✓ |
| `deleteEnv` | Delete an env var | ✓ |

### Deployments

| Tool | Description | Write |
|------|-------------|-------|
| `deploy` | Trigger a deployment | ✓ |
| `listDeployments` | List running deployments | |
| `getDeployment` | Get deployment status and logs | |
| `listAppDeployments` | List deployments for an application | |
| `cancelDeployment` | Cancel a running deployment | ✓ |

### Databases & Services

| Tool | Description | Write |
|------|-------------|-------|
| `listDatabases` | List all databases | |
| `getDatabase` | Get database details | |
| `listServices` | List one-click services | |
| `createService` | Create a one-click service | ✓ |

### Other

| Tool | Description |
|------|-------------|
| `listResources` | List all resources with filtering |

## Security Features

### Write Protection

Disable all write operations:

```bash
COOLIFY_ALLOW_WRITE=false
```

### Secret Masking

- Environment variable values are masked by default
- Database credentials are redacted
- Use `showSecrets: true` only when necessary

### Log Sanitization

Logs are sanitized to remove sensitive data. Control with `logMode`:

- `safe` (default): Redacts common secret patterns
- `strict`: More aggressive redaction
- `raw`: No redaction (requires `COOLIFY_ALLOW_UNSAFE_LOGS=true`)

## Development

```bash
git clone https://github.com/frndchagas/coolify-mcp.git
cd coolify-mcp
npm install
npm run dev
```

### Scripts

```bash
npm run dev            # Run in development mode
npm run build          # Build TypeScript
npm run generate       # Regenerate types from OpenAPI
npm run fetch:openapi  # Fetch latest OpenAPI spec
npm run update         # Fetch + regenerate
```

### Pinned Coolify Version

Version is defined in `src/coolify/constants.ts`. To update:

1. Edit `COOLIFY_VERSION` in `src/coolify/constants.ts`
2. Run `npm run update`

## Registry Listings

- MCP Registry (API): https://registry.modelcontextprotocol.io/v0.1/servers/io.github.frndchagas%2Fcoolify-mcp/versions/0.1.4
- MCP Registry Docs: https://registry.modelcontextprotocol.io/docs

## MCP Client Examples

### HTTP Client

```ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const client = new Client({ name: 'coolify-client', version: '1.0.0' });
const transport = new StreamableHTTPClientTransport(
  new URL('http://localhost:7331/mcp')
);

await client.connect(transport);

// List all applications
const apps = await client.callTool({
  name: 'coolify.listApplications',
  arguments: {},
});
console.log(apps.structuredContent);

// Deploy an application
const deploy = await client.callTool({
  name: 'coolify.deploy',
  arguments: { uuid: 'your-app-uuid' },
});
console.log(deploy.structuredContent);

await client.close();
```

### Stdio Client

```ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const client = new Client({ name: 'coolify-client', version: '1.0.0' });
const transport = new StdioClientTransport({
  command: 'npx',
  args: ['-y', '@fndchagas/coolify-mcp'],
  env: {
    COOLIFY_BASE_URL: 'https://coolify.example.com/api/v1',
    COOLIFY_TOKEN: '<token>',
  },
});

await client.connect(transport);

const result = await client.callTool({
  name: 'coolify.getApplication',
  arguments: { uuid: 'your-app-uuid' },
});
console.log(result.structuredContent);

await client.close();
```

## License

MIT
