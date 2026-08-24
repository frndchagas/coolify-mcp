import { createRequire } from 'node:module';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerBatchTools } from './tools/batch.js';
import { registerCoolifyTools } from './tools/coolify.js';
import { registerDatabaseTools } from './tools/databases.js';
import { registerDiagnosticsTools } from './tools/diagnostics.js';
import { registerDocsTools } from './tools/docs.js';
import { registerInfraTools } from './tools/infra.js';
import { registerResourceTools } from './tools/resources.js';
import { registerServiceTools } from './tools/services.js';

const require = createRequire(import.meta.url);
const { version: MCP_VERSION } = require('../package.json') as { version: string };

export function createMcpServer(): McpServer {
	const server = new McpServer({
		name: 'coolify-mcp',
		version: MCP_VERSION,
	});

	registerCoolifyTools(server);
	registerDatabaseTools(server);
	registerServiceTools(server);
	registerResourceTools(server);
	registerInfraTools(server);
	registerDiagnosticsTools(server);
	registerDocsTools(server);
	registerBatchTools(server);

	return server;
}
