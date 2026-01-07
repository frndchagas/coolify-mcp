import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import { request } from '../coolify/client.js';
import { COOLIFY_ALLOW_WRITE } from '../config.js';

function ensureWriteAllowed() {
	if (!COOLIFY_ALLOW_WRITE) {
		throw new Error('Write operations are disabled (COOLIFY_ALLOW_WRITE=false).');
	}
}

export function registerCoolifyTools(server: McpServer) {
	server.registerTool(
		'coolify.listResources',
		{
			title: 'List resources',
			description: 'List Coolify resources (apps, databases, etc).',
			inputSchema: {},
			outputSchema: { resources: z.array(z.unknown()) },
		},
		async () => {
			const data = await request('GET', '/api/v1/resources');
			return {
				content: [{ type: 'text', text: 'Resources fetched.' }],
				structuredContent: { resources: data },
			};
		}
	);

	server.registerTool(
		'coolify.getApplication',
		{
			title: 'Get application',
			description: 'Get application details by UUID.',
			inputSchema: { uuid: z.string() },
			outputSchema: { application: z.unknown() },
		},
		async ({ uuid }) => {
			const data = await request('GET', `/api/v1/applications/${uuid}`);
			return {
				content: [{ type: 'text', text: `Application ${uuid} fetched.` }],
				structuredContent: { application: data },
			};
		}
	);

	server.registerTool(
		'coolify.listEnvs',
		{
			title: 'List application env vars',
			description: 'List environment variables for an application.',
			inputSchema: { appUuid: z.string() },
			outputSchema: { envs: z.array(z.unknown()) },
		},
		async ({ appUuid }) => {
			const data = await request('GET', `/api/v1/applications/${appUuid}/envs`);
			return {
				content: [{ type: 'text', text: `Env vars for ${appUuid} fetched.` }],
				structuredContent: { envs: data },
			};
		}
	);

	server.registerTool(
		'coolify.upsertEnv',
		{
			title: 'Upsert environment variable',
			description: 'Upsert an environment variable for an application.',
			inputSchema: {
				appUuid: z.string(),
				key: z.string(),
				value: z.string(),
				is_buildtime: z.boolean().optional(),
				is_runtime: z.boolean().optional(),
			},
			outputSchema: { env: z.unknown() },
		},
		async ({ appUuid, key, value, is_buildtime = true, is_runtime = true }) => {
			ensureWriteAllowed();
			const data = await request('PATCH', `/api/v1/applications/${appUuid}/envs`, {
				body: { key, value, is_buildtime, is_runtime },
			});
			return {
				content: [{ type: 'text', text: `Env ${key} upserted for ${appUuid}.` }],
				structuredContent: { env: data },
			};
		}
	);

	server.registerTool(
		'coolify.deploy',
		{
			title: 'Trigger deploy',
			description: 'Trigger a deployment for an application.',
			inputSchema: { appUuid: z.string(), force: z.boolean().optional() },
			outputSchema: { deployment: z.unknown() },
		},
		async ({ appUuid, force = true }) => {
			ensureWriteAllowed();
			const data = await request('POST', '/api/v1/deploy', {
				query: { uuid: appUuid, force: String(force) },
			});
			return {
				content: [{ type: 'text', text: `Deploy triggered for ${appUuid}.` }],
				structuredContent: { deployment: data },
			};
		}
	);

	server.registerTool(
		'coolify.getDeployment',
		{
			title: 'Get deployment',
			description: 'Get deployment status by UUID.',
			inputSchema: { deploymentUuid: z.string() },
			outputSchema: { deployment: z.unknown() },
		},
		async ({ deploymentUuid }) => {
			const data = await request('GET', `/api/v1/deployments/${deploymentUuid}`);
			return {
				content: [{ type: 'text', text: `Deployment ${deploymentUuid} fetched.` }],
				structuredContent: { deployment: data },
			};
		}
	);

	server.registerTool(
		'coolify.getLogs',
		{
			title: 'Get application logs',
			description: 'Fetch runtime logs for an application.',
			inputSchema: { appUuid: z.string() },
			outputSchema: { logs: z.string() },
		},
		async ({ appUuid }) => {
			const data = await request<{ logs?: string }>(
				'GET',
				`/api/v1/applications/${appUuid}/logs`
			);
			return {
				content: [{ type: 'text', text: 'Logs fetched.' }],
				structuredContent: { logs: data.logs ?? '' },
			};
		}
	);

	server.registerTool(
		'coolify.listDatabases',
		{
			title: 'List databases',
			description: 'List Coolify databases.',
			inputSchema: {},
			outputSchema: { databases: z.array(z.unknown()) },
		},
		async () => {
			const data = await request('GET', '/api/v1/databases');
			return {
				content: [{ type: 'text', text: 'Databases fetched.' }],
				structuredContent: { databases: data },
			};
		}
	);

	server.registerTool(
		'coolify.getDatabase',
		{
			title: 'Get database',
			description: 'Get database details by UUID.',
			inputSchema: { uuid: z.string() },
			outputSchema: { database: z.unknown() },
		},
		async ({ uuid }) => {
			const data = await request('GET', `/api/v1/databases/${uuid}`);
			return {
				content: [{ type: 'text', text: `Database ${uuid} fetched.` }],
				structuredContent: { database: data },
			};
		}
	);
}
