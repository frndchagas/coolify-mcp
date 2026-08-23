#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
	COOLIFY_OPENAPI_REF,
	COOLIFY_STRICT_VERSION,
	MCP_HTTP_HOST,
	MCP_HTTP_PORT,
	MCP_HTTP_TOKEN,
	MCP_TRANSPORT,
} from './config.js';
import { initializeClient } from './coolify/client.js';
import { version } from './generated/sdk.gen.js';
import { createHttpApp } from './http-server.js';
import { createMcpServer } from './mcp-server.js';

initializeClient();

function normalizeVersion(value: string) {
	return value.replace(/^v/i, '');
}

function extractVersion(data: unknown): string {
	if (typeof data === 'string') return data;
	if (data && typeof data === 'object' && 'version' in data) {
		return String((data as { version: unknown }).version);
	}
	return 'unknown';
}

async function checkVersion() {
	try {
		const result = await version();
		if ('error' in result && result.error) {
			throw new Error('Failed to fetch version');
		}
		const data = 'data' in result ? result.data : undefined;
		const current = extractVersion(data);
		if (normalizeVersion(current) !== normalizeVersion(COOLIFY_OPENAPI_REF)) {
			const message = `Coolify version mismatch. Server=${current}, OpenAPI=${COOLIFY_OPENAPI_REF}.`;
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
	const server = createMcpServer();
	const transport = new StdioServerTransport();
	await server.connect(transport);
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

async function startHttp() {
	if (!MCP_HTTP_TOKEN && !LOOPBACK_HOSTS.has(MCP_HTTP_HOST)) {
		console.warn(
			`WARNING: HTTP transport bound to ${MCP_HTTP_HOST} without MCP_HTTP_TOKEN — anyone who can reach port ${MCP_HTTP_PORT} controls the Coolify instance behind this server.`
		);
	}

	const app = createHttpApp();
	app.listen(MCP_HTTP_PORT, MCP_HTTP_HOST, () => {
		console.log(`MCP HTTP server listening on ${MCP_HTTP_HOST}:${MCP_HTTP_PORT}/mcp`);
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
