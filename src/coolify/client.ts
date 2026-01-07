import { COOLIFY_BASE_URL, COOLIFY_TOKEN } from '../config.js';
import { client } from '../generated/client.gen.js';

export function initializeClient() {
	if (!COOLIFY_BASE_URL) {
		throw new Error('COOLIFY_BASE_URL is required');
	}
	if (!COOLIFY_TOKEN) {
		throw new Error('COOLIFY_TOKEN is required');
	}

	client.setConfig({
		baseUrl: COOLIFY_BASE_URL,
		headers: {
			Authorization: `Bearer ${COOLIFY_TOKEN}`,
		},
	});
}
