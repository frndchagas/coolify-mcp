import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express, { type Request, type Response } from 'express';
import { registerCoolifyTools } from './tools/coolify.js';
import {
	COOLIFY_OPENAPI_REF,
	COOLIFY_STRICT_VERSION,
	MCP_HTTP_PORT,
	MCP_TRANSPORT,
} from './config.js';
import { getVersion } from './coolify/client.js';

const server = new McpServer({
	name: 'coolify-mcp',
	version: '0.1.1',
});

registerCoolifyTools(server);

function normalizeVersion(value: string) {
	return value.replace(/^v/i, '');
}

async function checkVersion() {
	try {
		const current = await getVersion();
		if (normalizeVersion(current) !== normalizeVersion(COOLIFY_OPENAPI_REF)) {
			const message =
				`Coolify version mismatch. Server=${current}, OpenAPI=${COOLIFY_OPENAPI_REF}.`;
			if (COOLIFY_STRICT_VERSION) {
				throw new Error(message);
			}
			console.warn(message);
		}
	} catch (error) {
		if (COOLIFY_STRICT_VERSION) {
			throw error;
		}
		console.warn('Version check failed:', error instanceof Error ? error.message : error);
	}
}

async function startStdio() {
	const transport = new StdioServerTransport();
	await server.connect(transport);
}

async function startHttp() {
	const app = express();
	app.use(express.json());

	app.post('/mcp', async (req: Request, res: Response) => {
		const transport = new StreamableHTTPServerTransport({
			sessionIdGenerator: undefined,
			enableJsonResponse: true,
		});
		res.on('close', () => transport.close());
		await server.connect(transport);
		await transport.handleRequest(req, res, req.body);
	});

	app.listen(MCP_HTTP_PORT, () => {
		console.log(`MCP HTTP server listening on :${MCP_HTTP_PORT}/mcp`);
	});
}

await checkVersion();

if (MCP_TRANSPORT === 'stdio') {
	await startStdio();
} else if (MCP_TRANSPORT === 'http') {
	await startHttp();
} else if (MCP_TRANSPORT === 'both') {
	await Promise.all([startStdio(), startHttp()]);
} else {
	throw new Error(`Unknown MCP_TRANSPORT: ${MCP_TRANSPORT}`);
}
