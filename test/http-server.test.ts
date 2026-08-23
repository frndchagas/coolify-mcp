import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createHttpApp } from '../src/http-server.js';
import { createMcpServer } from '../src/mcp-server.js';

describe('stateless HTTP server isolation', () => {
	it('creates a fresh configured MCP server each time', () => {
		expect(createMcpServer()).not.toBe(createMcpServer());
	});

	it('isolates overlapping requests that reuse the same JSON-RPC id', async () => {
		const serverInstances: McpServer[] = [];
		let waitingRequests = 0;
		let releaseRequests!: () => void;
		const bothRequestsArrived = new Promise<void>((resolve) => {
			releaseRequests = resolve;
		});

		const app = createHttpApp({
			serverFactory: () => {
				const requestServer = new McpServer({ name: 'isolation-test', version: '1' });
				requestServer.registerTool(
					'echoClient',
					{ inputSchema: { client: z.string() } },
					async ({ client }) => {
						waitingRequests++;
						if (waitingRequests === 2) releaseRequests();
						await bothRequestsArrived;
						return { content: [{ type: 'text', text: client }] };
					}
				);
				serverInstances.push(requestServer);
				return requestServer;
			},
			token: null,
		});
		const listener = app.listen(0, '127.0.0.1');
		await once(listener, 'listening');
		const { port } = listener.address() as AddressInfo;

		try {
			const send = (client: string) =>
				fetch(`http://127.0.0.1:${port}/mcp`, {
					method: 'POST',
					headers: {
						'content-type': 'application/json',
						accept: 'application/json, text/event-stream',
					},
					body: JSON.stringify({
						jsonrpc: '2.0',
						id: 1,
						method: 'tools/call',
						params: { name: 'echoClient', arguments: { client } },
					}),
				});
			const [alphaResponse, betaResponse] = await Promise.all([
				send('alpha'),
				send('beta'),
			]);

			expect(alphaResponse.status).toBe(200);
			expect(betaResponse.status).toBe(200);
			expect(await alphaResponse.json()).toMatchObject({
				jsonrpc: '2.0',
				id: 1,
				result: { content: [{ type: 'text', text: 'alpha' }] },
			});
			expect(await betaResponse.json()).toMatchObject({
				jsonrpc: '2.0',
				id: 1,
				result: { content: [{ type: 'text', text: 'beta' }] },
			});
		} finally {
			await new Promise<void>((resolve, reject) => {
				listener.close((error) => (error ? reject(error) : resolve()));
			});
		}

		expect(serverInstances).toHaveLength(2);
		expect(new Set(serverInstances).size).toBe(2);
	});
});
