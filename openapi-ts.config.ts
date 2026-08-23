import { defineConfig } from '@hey-api/openapi-ts';
import { COOLIFY_OPENAPI_RAW_URL } from './src/coolify/constants.js';

interface OpenAPIParameter {
	name: string;
	in: 'path' | 'query' | 'header' | 'cookie';
	schema?: {
		type?: string;
		format?: string;
		[key: string]: unknown;
	};
	[key: string]: unknown;
}

interface OpenAPIOperation {
	parameters?: OpenAPIParameter[];
	[key: string]: unknown;
}

interface OpenAPIPath {
	get?: OpenAPIOperation;
	post?: OpenAPIOperation;
	put?: OpenAPIOperation;
	patch?: OpenAPIOperation;
	delete?: OpenAPIOperation;
	[key: string]: unknown;
}

interface OpenAPISpec {
	openapi: string;
	info: { title: string; version: string };
	paths?: Record<string, OpenAPIPath>;
	[key: string]: unknown;
}

/**
 * Fetch and fix Coolify OpenAPI spec on-the-fly.
 * Removes `format: uuid` from path/query parameters (Coolify uses non-standard IDs).
 */
async function fetchAndFixSpec(): Promise<OpenAPISpec> {
	console.log(`Fetching OpenAPI spec from: ${COOLIFY_OPENAPI_RAW_URL}`);

	const response = await fetch(COOLIFY_OPENAPI_RAW_URL);
	if (!response.ok) {
		throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
	}

	const spec = (await response.json()) as OpenAPISpec;
	console.log(`OpenAPI version: ${spec.info.version}`);

	let fixCount = 0;
	const methods = ['get', 'post', 'put', 'patch', 'delete'] as const;

	for (const pathItem of Object.values(spec.paths ?? {})) {
		for (const method of methods) {
			const operation = pathItem[method] as OpenAPIOperation | undefined;
			if (!operation?.parameters) continue;

			for (const param of operation.parameters) {
				if (
					(param.in === 'path' || param.in === 'query') &&
					param.schema?.format === 'uuid'
				) {
					delete param.schema.format;
					fixCount++;
				}
			}
		}
	}

	console.log(`Applied ${fixCount} fixes (removed format:uuid from parameters)`);

	// Coolify's spec marks environment_name AND environment_uuid as required on
	// create endpoints, but the API accepts either one (upstream fix pending:
	// coollabsio/coolify#11134). Relax required arrays that contain both so the
	// generated schemas and SDK request validation match real behavior.
	let envFixCount = 0;
	const walkSchemas = (node: unknown): void => {
		if (Array.isArray(node)) {
			for (const item of node) walkSchemas(item);
			return;
		}
		if (node === null || typeof node !== 'object') return;
		const record = node as Record<string, unknown>;
		const required = record.required;
		if (
			Array.isArray(required) &&
			required.includes('environment_name') &&
			required.includes('environment_uuid')
		) {
			record.required = required.filter(
				(field) => field !== 'environment_name' && field !== 'environment_uuid'
			);
			envFixCount++;
		}
		for (const value of Object.values(record)) walkSchemas(value);
	};
	walkSchemas(spec.paths ?? {});
	console.log(
		`Applied ${envFixCount} fixes (environment_name/environment_uuid one-of relaxation)`
	);

	return spec;
}

// Only include operations surfaced by the hand-written MCP tools.
const USED_OPERATIONS = [
	// Resources
	'GET /resources',
	// Projects
	'GET /projects',
	'POST /projects',
	'GET /projects/{uuid}',
	'PATCH /projects/{uuid}',
	'DELETE /projects/{uuid}',
	// Environments
	'GET /projects/{uuid}/environments',
	'POST /projects/{uuid}/environments',
	'GET /projects/{uuid}/{environment_name_or_uuid}',
	// Servers
	'GET /servers',
	'POST /servers',
	'GET /servers/{uuid}',
	'PATCH /servers/{uuid}',
	'DELETE /servers/{uuid}',
	'POST /servers/{uuid}/validate',
	'GET /servers/{uuid}/domains',
	'GET /servers/{uuid}/resources',
	// Private Keys (Security)
	'GET /security/keys',
	'POST /security/keys',
	'PATCH /security/keys',
	'GET /security/keys/{uuid}',
	'DELETE /security/keys/{uuid}',
	// GitHub Apps
	'GET /github-apps',
	'GET /github-apps/{github_app_id}/repositories',
	'GET /github-apps/{github_app_id}/repositories/{owner}/{repo}/branches',
	// Applications - read
	'GET /applications',
	'GET /applications/{uuid}',
	'GET /applications/{uuid}/envs',
	'POST /applications/{uuid}/envs',
	'PATCH /applications/{uuid}/envs',
	'PATCH /applications/{uuid}/envs/bulk',
	'DELETE /applications/{uuid}/envs/{env_uuid}',
	'DELETE /applications/{uuid}/previews/{pull_request_id}',
	'GET /applications/{uuid}/logs',
	// Applications - create
	'POST /applications/public',
	'POST /applications/private-github-app',
	'POST /applications/private-deploy-key',
	'POST /applications/dockerfile',
	'POST /applications/dockerimage',
	// Applications - manage
	'PATCH /applications/{uuid}',
	'DELETE /applications/{uuid}',
	'POST /applications/{uuid}/start',
	'POST /applications/{uuid}/stop',
	'POST /applications/{uuid}/restart',
	// Databases
	'GET /databases',
	'GET /databases/{uuid}',
	'PATCH /databases/{uuid}',
	'DELETE /databases/{uuid}',
	'POST /databases/{uuid}/start',
	'POST /databases/{uuid}/stop',
	'POST /databases/{uuid}/restart',
	// Databases - create (one endpoint per engine)
	'POST /databases/postgresql',
	'POST /databases/mysql',
	'POST /databases/mariadb',
	'POST /databases/mongodb',
	'POST /databases/redis',
	'POST /databases/keydb',
	'POST /databases/dragonfly',
	'POST /databases/clickhouse',
	// Database envs
	'GET /databases/{uuid}/envs',
	'POST /databases/{uuid}/envs',
	'PATCH /databases/{uuid}/envs',
	'PATCH /databases/{uuid}/envs/bulk',
	'DELETE /databases/{uuid}/envs/{env_uuid}',
	// Database backups
	'GET /databases/{uuid}/backups',
	'POST /databases/{uuid}/backups',
	'PATCH /databases/{uuid}/backups/{scheduled_backup_uuid}',
	'DELETE /databases/{uuid}/backups/{scheduled_backup_uuid}',
	'GET /databases/{uuid}/backups/{scheduled_backup_uuid}/executions',
	'DELETE /databases/{uuid}/backups/{scheduled_backup_uuid}/executions/{execution_uuid}',
	// Services
	'GET /services',
	'POST /services',
	'GET /services/{uuid}',
	'PATCH /services/{uuid}',
	'DELETE /services/{uuid}',
	'POST /services/{uuid}/start',
	'POST /services/{uuid}/stop',
	'POST /services/{uuid}/restart',
	// Service envs
	'GET /services/{uuid}/envs',
	'POST /services/{uuid}/envs',
	'PATCH /services/{uuid}/envs',
	'PATCH /services/{uuid}/envs/bulk',
	'DELETE /services/{uuid}/envs/{env_uuid}',
	// Storages (applications, databases, services)
	'GET /applications/{uuid}/storages',
	'POST /applications/{uuid}/storages',
	'PATCH /applications/{uuid}/storages',
	'DELETE /applications/{uuid}/storages/{storage_uuid}',
	'GET /databases/{uuid}/storages',
	'POST /databases/{uuid}/storages',
	'PATCH /databases/{uuid}/storages',
	'DELETE /databases/{uuid}/storages/{storage_uuid}',
	'GET /services/{uuid}/storages',
	'POST /services/{uuid}/storages',
	'PATCH /services/{uuid}/storages',
	'DELETE /services/{uuid}/storages/{storage_uuid}',
	// Scheduled tasks (applications, services)
	'GET /applications/{uuid}/scheduled-tasks',
	'POST /applications/{uuid}/scheduled-tasks',
	'PATCH /applications/{uuid}/scheduled-tasks/{task_uuid}',
	'DELETE /applications/{uuid}/scheduled-tasks/{task_uuid}',
	'GET /applications/{uuid}/scheduled-tasks/{task_uuid}/executions',
	'GET /services/{uuid}/scheduled-tasks',
	'POST /services/{uuid}/scheduled-tasks',
	'PATCH /services/{uuid}/scheduled-tasks/{task_uuid}',
	'DELETE /services/{uuid}/scheduled-tasks/{task_uuid}',
	'GET /services/{uuid}/scheduled-tasks/{task_uuid}/executions',
	// Teams
	'GET /teams',
	'GET /team',
	'GET /team/members',
	'GET /teams/{id}',
	'GET /teams/{id}/members',
	// Deployments
	'GET /deployments',
	'GET /deployments/{uuid}',
	'POST /deployments/{uuid}/cancel',
	'GET /deployments/applications/{uuid}',
	'POST /deploy',
	// Version & health
	'GET /version',
	'GET /health',
];

export default defineConfig({
	input: await fetchAndFixSpec(),
	output: {
		path: './src/generated',
		format: 'prettier',
	},
	parser: {
		filters: {
			operations: {
				include: USED_OPERATIONS,
			},
			// Remove unused schemas
			orphans: false,
		},
	},
	plugins: [
		{
			name: '@hey-api/typescript',
			enums: 'javascript',
		},
		{
			name: 'zod',
			requests: true,
			responses: true,
			definitions: true,
		},
		{
			name: '@hey-api/sdk',
			operations: {
				strategy: 'flat',
			},
			validator: {
				request: true,
				response: false, // Coolify API returns null for fields not marked nullable
			},
		},
	],
});
