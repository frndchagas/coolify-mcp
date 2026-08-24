import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express, { type NextFunction, type Request, type Response } from 'express';
import { MCP_HTTP_TOKEN } from './config.js';
import { createMcpServer } from './mcp-server.js';
import { checkBearerAuth } from './tools/helpers.js';

interface HttpAppOptions {
	serverFactory?: typeof createMcpServer;
	transportFactory?: () => StreamableHTTPServerTransport;
	token?: string | null;
}

export function createHttpApp({
	serverFactory = createMcpServer,
	transportFactory = () =>
		new StreamableHTTPServerTransport({
			sessionIdGenerator: undefined,
			enableJsonResponse: true,
		}),
	token = MCP_HTTP_TOKEN,
}: HttpAppOptions = {}) {
	const app = express();
	app.use(express.json());

	if (token) {
		app.use('/mcp', (req: Request, res: Response, next: NextFunction) => {
			if (checkBearerAuth(req.headers.authorization, token)) {
				next();
				return;
			}
			res.status(401).json({ error: 'Unauthorized' });
		});
	}

	app.post('/mcp', async (req: Request, res: Response) => {
		// Stateless transports must never share a protocol/server instance across
		// requests. Shared instances can route a response or elicitation request to
		// a different client when JSON-RPC message IDs overlap.
		const requestServer = serverFactory();
		const transport = transportFactory();
		res.on('close', () => transport.close());
		await requestServer.connect(transport);
		await transport.handleRequest(req, res, req.body);
	});

	return app;
}
