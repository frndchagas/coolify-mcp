import { COOLIFY_BASE_URL, COOLIFY_TOKEN } from '../config.js';

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

function requireEnv(value: string | undefined, name: string): string {
	if (!value) {
		throw new Error(`${name} is required`);
	}
	return value;
}

function buildUrl(path: string, query?: Record<string, string | undefined>): string {
	const base = requireEnv(COOLIFY_BASE_URL, 'COOLIFY_BASE_URL');
	const url = new URL(path, base);
	if (query) {
		for (const [key, value] of Object.entries(query)) {
			if (value !== undefined) {
				url.searchParams.set(key, value);
			}
		}
	}
	return url.toString();
}

export async function request<T = unknown>(
	method: HttpMethod,
	path: string,
	options?: { query?: Record<string, string | undefined>; body?: unknown }
): Promise<T> {
	const token = requireEnv(COOLIFY_TOKEN, 'COOLIFY_TOKEN');
	const url = buildUrl(path, options?.query);
	const headers: Record<string, string> = {
		Authorization: `Bearer ${token}`,
		Accept: 'application/json',
	};
	let body: string | undefined;
	if (options?.body !== undefined) {
		headers['Content-Type'] = 'application/json';
		body = JSON.stringify(options.body);
	}

	const response = await fetch(url, { method, headers, body });
	const contentType = response.headers.get('content-type') ?? '';
	if (!response.ok) {
		const text = await response.text();
		throw new Error(`Coolify API error ${response.status}: ${text || response.statusText}`);
	}
	if (contentType.includes('application/json')) {
		return (await response.json()) as T;
	}
	return (await response.text()) as T;
}

export async function getVersion(): Promise<string> {
	const data = await request<unknown>('GET', '/api/v1/version');
	if (typeof data === 'string') {
		return data.trim();
	}
	if (data && typeof data === 'object' && 'version' in data) {
		const version = (data as { version?: string }).version;
		return version ?? 'unknown';
	}
	return 'unknown';
}
