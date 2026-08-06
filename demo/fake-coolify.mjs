// Minimal fake Coolify API with fictional data, for recording the demo GIF.
// Response shapes match the real API (including the {count, deployments}
// envelope), so the MCP server's real behavior is what gets recorded.
import { createServer } from 'node:http';

const apps = [
  {
    id: 1, uuid: 'a1storefront', name: 'storefront', status: 'running:healthy',
    fqdn: 'https://shop.demo.dev', git_repository: 'acme/storefront', git_branch: 'main',
  },
  {
    id: 2, uuid: 'a2apigateway', name: 'api-gateway', status: 'running:healthy',
    fqdn: 'https://api.demo.dev', git_repository: 'acme/api-gateway', git_branch: 'main',
  },
  {
    id: 3, uuid: 'a3worker', name: 'worker', status: 'exited:unhealthy',
    fqdn: '', git_repository: 'acme/worker', git_branch: 'main',
  },
];

const failedLogs = JSON.stringify([
  { output: 'Building worker image...', type: 'stdout' },
  { output: 'npm ERR! Missing script: "build:worker"', type: 'stderr' },
  { output: 'Build step failed with exit code 1', type: 'stderr' },
]);

const routes = {
  '/api/v1/health': () => 'OK',
  '/api/v1/version': () => 'v4.1.2',
  '/api/v1/servers': () => [
    { id: 1, uuid: 's1', name: 'prod-1', ip: '10.0.0.11', proxy_type: 'traefik' },
    { id: 2, uuid: 's2', name: 'prod-2', ip: '10.0.0.12', proxy_type: 'traefik' },
  ],
  '/api/v1/projects': () => [
    { id: 1, uuid: 'p1', name: 'acme-production' },
    { id: 2, uuid: 'p2', name: 'acme-staging' },
  ],
  '/api/v1/applications': () => apps,
  '/api/v1/databases': () => [
    { id: 1, uuid: 'd1', name: 'orders-db', status: 'running', type: 'postgresql', postgres_password: 'super-secret-value' },
    { id: 2, uuid: 'd2', name: 'sessions', status: 'running', type: 'redis', redis_password: 'another-secret' },
  ],
  '/api/v1/services': () => [
    { id: 1, uuid: 'sv1', name: 'metabase', status: 'running' },
  ],
  '/api/v1/deployments': () => [],
};

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;
  res.setHeader('Content-Type', 'application/json');

  if (routes[path]) {
    res.end(JSON.stringify(routes[path]()));
    return;
  }
  const deployMatch = path.match(/^\/api\/v1\/deployments\/applications\/(.+)$/);
  if (deployMatch) {
    const uuid = deployMatch[1];
    const failed = uuid === 'a3worker';
    res.end(
      JSON.stringify({
        count: failed ? 12 : 34,
        deployments: [
          {
            id: 900, deployment_uuid: 'dep-900', status: failed ? 'failed' : 'finished',
            commit: '9f2c1ab', commit_message: failed ? 'add worker queue' : 'bump deps',
            created_at: '2026-08-06T09:12:04.000000Z',
            logs: failed ? failedLogs : '[]',
          },
        ],
      })
    );
    return;
  }
  const logsMatch = path.match(/^\/api\/v1\/applications\/(.+)\/logs$/);
  if (logsMatch) {
    res.end(JSON.stringify({ logs: 'worker exited with code 1\nrestarting in 5s...' }));
    return;
  }
  res.end(JSON.stringify([]));
});

server.listen(7799, '127.0.0.1', () => console.error('fake coolify on :7799'));
