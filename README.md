# coolify-mcp

[![npm version](https://img.shields.io/npm/v/@fndchagas/coolify-mcp.svg)](https://www.npmjs.com/package/@fndchagas/coolify-mcp)
[![npm downloads](https://img.shields.io/npm/dm/@fndchagas/coolify-mcp.svg)](https://www.npmjs.com/package/@fndchagas/coolify-mcp)
[![license](https://img.shields.io/npm/l/@fndchagas/coolify-mcp.svg)](LICENSE)
[![node version](https://img.shields.io/node/v/@fndchagas/coolify-mcp.svg)](package.json)
[![typescript](https://img.shields.io/badge/TypeScript-5.9.3-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![CI](https://github.com/frndchagas/coolify-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/frndchagas/coolify-mcp/actions/workflows/ci.yml)
[![Glama score](https://glama.ai/mcp/servers/frndchagas/coolify-mcp/badges/score.svg)](https://glama.ai/mcp/servers/frndchagas/coolify-mcp)

MCP server for Coolify API - enables full deployment workflows from zero to production.

![coolify-mcp demo](docs/demo.gif)

Targets the **Coolify v4.1.2** API. Types and schemas are generated directly from Coolify's official OpenAPI spec, so tool inputs always match what the API actually accepts.

## Features

- **Full Deployment Workflow**: Create projects, environments, servers, and applications from scratch
- **5 Application Types**: one `createApplication` tool covers public git, GitHub App, Deploy Key, Dockerfile, and Docker Image sources — plus Docker Compose deployments via `createService` (since Coolify v4.1, compose deployments are services)
- **Environment Management**: Full CRUD for environment variables with secret masking
- **Deployment Control**: Deploy (optionally waiting for the terminal status, with a log tail on failure), start, stop, restart applications
- **Diagnostics**: `diagnoseApp` finds an app by UUID, name, or domain and aggregates status, recent deployments, failure log tails, runtime logs, and suggested next actions
- **Docs Search**: `searchDocs` runs full-text search across the official Coolify documentation from a bundled local index — no network needed
- **Security**: Write protection, secret redaction, and MCP annotations (`readOnlyHint`/`destructiveHint`) so clients can auto-approve reads and gate destructive calls
- **Near-full API coverage**: databases (8 engines, backups, envs), services, storages, scheduled tasks, teams, previews, servers, SSH keys, and GitHub Apps
- **Token-efficient**: 65 tools whose definitions cost ~9k tokens of context, with strict runtime validation against schemas generated from Coolify's OpenAPI spec

## Requirements

- Node 18+
- A Coolify API token (Settings > API in your Coolify dashboard)

## Install

**Claude Desktop, one-click:** download [`coolify-mcp.mcpb`](https://github.com/frndchagas/coolify-mcp/releases/latest/download/coolify-mcp.mcpb) from the latest release and drag it into **Settings → Extensions**. You'll be prompted for your Coolify URL and token — no Node install, no JSON editing.

**Via npm:**

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
| `COOLIFY_STRICT_VERSION` | `false` | Fail on API version mismatch |
| `COOLIFY_MCP_ELICITATION` | `on` | Set to `off` to skip human confirmation on destructive deletes (escape hatch for clients that advertise elicitation but do not implement it) |
| `MCP_TRANSPORT` | `stdio` | Transport: `stdio`, `http`, `both` |
| `PORT` | `7331` | HTTP port (when using http transport) |
| `MCP_HTTP_TOKEN` | unset | Bearer token required on `/mcp` requests (HTTP transport). Setting it also switches the default bind to `0.0.0.0` |
| `MCP_HTTP_HOST` | `127.0.0.1` (`0.0.0.0` with token) | Interface the HTTP transport binds to. Binding beyond loopback without a token logs a loud warning |

## Deploy from Zero

With this MCP, you can deploy an application from scratch:

```
1. listProjects / createProject       → Get or create a project
2. listEnvironments / createEnvironment → Get or create an environment
3. listServers / createServer         → Get or create a server
4. listPrivateKeys / createPrivateKey → Get or create SSH keys (if needed)
5. createApplication (type: public)   → Create the application
6. applicationEnvs (action: upsert)   → Configure environment variables
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
| `createApplication` | Create an application; `type` selects the source: `public`, `private-github-app`, `private-deploy-key`, `dockerfile`, or `dockerimage`. Long-tail fields go in `extra` and are validated per type. | ✓ |

> Docker Compose deployments are created with `createService` passing `docker_compose_raw` — since Coolify v4.1 they are services, not applications.

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
| `applicationEnvs` | Manage application env vars: list (masked by default), create, update, upsert by key, bulk_update, delete | ✓ |

> Database and service env vars have their own tools: `databaseEnvs` and `serviceEnvs`.

### Deployments

| Tool | Description | Write |
|------|-------------|-------|
| `deploy` | Trigger a deployment; `wait: true` polls to the terminal status and returns a log tail on failure | ✓ |
| `diagnoseApp` | Diagnose an app by UUID, name, or domain: status, recent deployments, failure log tail, runtime logs, hints | |
| `diagnoseServer` | Diagnose a server by UUID, name, or IP: resource status breakdown, domains, hints | |
| `listDeployments` | List running deployments | |
| `getDeployment` | Get deployment status and logs | |
| `listAppDeployments` | List deployments for an application | |
| `cancelDeployment` | Cancel a running deployment | ✓ |

### Databases

| Tool | Description | Write |
|------|-------------|-------|
| `listDatabases` | List all databases | |
| `getDatabase` | Get database details | |
| `createDatabase` | Create a database; `type` selects the engine: postgresql, mysql, mariadb, mongodb, redis, keydb, dragonfly, clickhouse | ✓ |
| `updateDatabase` | Update database configuration | ✓ |
| `deleteDatabase` | Delete a database (volumes/configs deleted by default) | ✓ |
| `controlDatabase` | Start, stop, or restart a database | ✓ |
| `databaseBackups` | Manage backup schedules and executions (list/create/update/delete/list_executions/delete_execution) | ✓ |
| `databaseEnvs` | Manage database env vars (list/create/update/bulk_update/delete) | ✓ |

### Services

| Tool | Description | Write |
|------|-------------|-------|
| `listServices` | List services | |
| `getService` | Get service details (secrets masked by default) | |
| `createService` | Create a one-click service or Docker Compose deployment | ✓ |
| `updateService` | Update a service | ✓ |
| `deleteService` | Delete a service | ✓ |
| `controlService` | Start, stop, or restart a service | ✓ |
| `serviceEnvs` | Manage service env vars (list/create/update/bulk_update/delete) | ✓ |

### Storages, Scheduled Tasks & Previews

| Tool | Description | Write |
|------|-------------|-------|
| `storages` | Manage persistent volumes and file mounts for applications, databases, and services | ✓ |
| `scheduledTasks` | Manage cron tasks for applications and services, including execution history | ✓ |
| `deletePreview` | Delete a preview deployment by pull request id | ✓ |

### Teams, Servers & Git

| Tool | Description | Write |
|------|-------------|-------|
| `teams` | List teams, get current team, and list members | |
| `updateServer` | Update server configuration | ✓ |
| `deleteServer` | Delete a server | ✓ |
| `getServerResources` | List resources running on a server | |
| `getServerDomains` | List domains configured on a server | |
| `getPrivateKey` | Get SSH key metadata (key material masked by default) | |
| `updatePrivateKey` | Update an SSH private key | ✓ |
| `deletePrivateKey` | Delete an SSH private key | ✓ |
| `getGithubAppRepositories` | List repositories accessible to a GitHub App | |
| `getGithubAppBranches` | List branches of a repository | |

### Batch Operations

| Tool | Description | Write |
|------|-------------|-------|
| `getInfrastructureOverview` | One-call summary of servers, projects, applications (status breakdown), databases, services, and running deployments | |
| `restartProjectApps` | Restart every application in a project or environment (asks for confirmation) | ✓ |
| `redeployProject` | Trigger a deployment for every application in a project or environment (asks for confirmation) | ✓ |
| `stopAllApplications` | Emergency stop of all running applications, optionally per project (asks for confirmation, stating the blast radius) | ✓ |

### Other

| Tool | Description |
|------|-------------|
| `listResources` | List all resources with filtering |
| `searchDocs` | Full-text search across the official Coolify docs (bundled index, no network) |
| `getHealth` | Check that the Coolify API is up |

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

### HTTP Transport Hardening

The HTTP transport binds to `127.0.0.1` by default. To expose it beyond loopback, set `MCP_HTTP_TOKEN` — every request to `/mcp` must then carry `Authorization: Bearer <token>` (checked in constant time) — and the bind switches to `0.0.0.0` (override with `MCP_HTTP_HOST`). Binding to a non-loopback host without a token logs a loud warning: anyone who can reach the port controls your Coolify instance.

### Human Confirmation on Destructive Deletes

On MCP clients that support [elicitation](https://modelcontextprotocol.io/specification/2025-06-18/changelog) (Claude Code, VS Code Copilot), deleting a project, application, database, service, server, or private key asks **you** to confirm first, stating what will be lost. Clients without elicitation behave exactly as before. A decline, cancel, or timeout aborts the call; set `COOLIFY_MCP_ELICITATION=off` to disable the prompts entirely.

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
npm run generate       # Fetch the pinned OpenAPI spec and regenerate types
```

### Pinned Coolify Version

Version is defined in `src/coolify/constants.ts`. To update:

1. Edit `COOLIFY_VERSION` in `src/coolify/constants.ts`
2. Run `npm run generate`

## Registry Listings

- MCP Registry: [`io.github.frndchagas/coolify-mcp`](https://registry.modelcontextprotocol.io/v0.1/servers/io.github.frndchagas%2Fcoolify-mcp)

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
  name: 'listApplications',
  arguments: {},
});
console.log(apps.structuredContent);

// Deploy an application
const deploy = await client.callTool({
  name: 'deploy',
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
  name: 'getApplication',
  arguments: { uuid: 'your-app-uuid' },
});
console.log(result.structuredContent);

await client.close();
```

## License

MIT
