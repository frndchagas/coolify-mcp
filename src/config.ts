export const COOLIFY_BASE_URL = process.env.COOLIFY_BASE_URL;
export const COOLIFY_TOKEN = process.env.COOLIFY_TOKEN;
export const COOLIFY_OPENAPI_REF =
	process.env.COOLIFY_OPENAPI_REF ?? 'v4.0.0-beta.460';

export const MCP_TRANSPORT = process.env.MCP_TRANSPORT ?? 'stdio';
export const MCP_HTTP_PORT = Number(process.env.PORT ?? '7331');

export const COOLIFY_STRICT_VERSION = process.env.COOLIFY_STRICT_VERSION === 'true';
export const COOLIFY_ALLOW_WRITE = process.env.COOLIFY_ALLOW_WRITE !== 'false';
