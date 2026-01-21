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
	return spec;
}

// Only include operations we actually use (48 of 107)
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
	// Servers
	'GET /servers',
	'POST /servers',
	'GET /servers/{uuid}',
	'GET /servers/{uuid}/validate',
	// Private Keys (Security)
	'GET /security/keys',
	'POST /security/keys',
	// GitHub Apps
	'GET /github-apps',
	// Applications - read
	'GET /applications',
	'GET /applications/{uuid}',
	'GET /applications/{uuid}/envs',
	'POST /applications/{uuid}/envs',
	'PATCH /applications/{uuid}/envs',
	'DELETE /applications/{uuid}/envs/{env_uuid}',
	'GET /applications/{uuid}/logs',
	// Applications - create
	'POST /applications/public',
	'POST /applications/private-github-app',
	'POST /applications/private-deploy-key',
	'POST /applications/dockerfile',
	'POST /applications/dockerimage',
	'POST /applications/dockercompose',
	// Applications - manage
	'PATCH /applications/{uuid}',
	'DELETE /applications/{uuid}',
	'GET /applications/{uuid}/start',
	'GET /applications/{uuid}/stop',
	'GET /applications/{uuid}/restart',
	// Databases
	'GET /databases',
	'GET /databases/{uuid}',
	// Services
	'GET /services',
	'POST /services',
	// Deployments
	'GET /deployments',
	'GET /deployments/{uuid}',
	'POST /deployments/{uuid}/cancel',
	'GET /deployments/applications/{uuid}',
	'GET /deploy',
	// Version
	'GET /version',
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
