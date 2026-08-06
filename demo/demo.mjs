// Drives the real coolify-mcp server and prints tool calls/results the way
// an MCP client would, for the demo recording.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BOLD = '\x1b[1m';
const R = '\x1b[0m';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const transport = new StdioClientTransport({
  command: 'node',
  args: ['/Users/fernandochagas/projects/opensource/coolify-mcp/dist/server.js'],
  env: {
    ...process.env,
    COOLIFY_BASE_URL: 'http://127.0.0.1:7799/api/v1',
    COOLIFY_TOKEN: 'demo-token',
    COOLIFY_ALLOW_WRITE: 'false',
  },
  stderr: 'pipe',
});

const client = new Client({ name: 'demo', version: '1.0.0' });
await client.connect(transport);
const { tools } = await client.listTools();
console.log(`${GREEN}✓${R} connected · ${BOLD}${tools.length} tools${R} ${DIM}(${tools.filter((t) => t.annotations?.readOnlyHint).length} read-only, ${tools.filter((t) => t.annotations?.destructiveHint).length} destructive)${R}\n`);
await sleep(450);

async function ask(question, name, args) {
  console.log(`${BOLD}❯${R} ${question}`);
  await sleep(450);
  console.log(`${DIM}  → ${name}(${JSON.stringify(args)})${R}`);
  const res = await client.callTool({ name, arguments: args });
  const text = res.content?.[0]?.text ?? '';
  console.log(`${CYAN}  ${text}${R}`);
  await sleep(250);
  return res.structuredContent;
}

const overview = await ask(
  'what is the state of my infrastructure?',
  'getInfrastructureOverview',
  {}
);
console.log(
  `${DIM}    apps by status: ${JSON.stringify(overview.application_status_breakdown)}${R}\n`
);
await sleep(900);

const diag = await ask('why is the worker down?', 'diagnoseApp', {
  identifier: 'worker',
});
for (const hint of diag.hints ?? []) console.log(`${YELLOW}    ! ${hint}${R}`);
for (const line of (diag.failed_deployment_log_tail ?? []).slice(-2)) {
  console.log(`${DIM}    | ${line}${R}`);
}
console.log();
await sleep(1100);

const dbs = await ask('list my databases', 'listDatabases', { limit: 2 });
for (const db of dbs.items ?? []) {
  console.log(`${DIM}    ${db.name} (${db.type}) ${R}`);
}
console.log(`${GREEN}    secrets masked by default${R}\n`);
await sleep(900);

await ask('how do I add a custom domain?', 'searchDocs', {
  query: 'custom domain application',
  limit: 2,
});
await sleep(900);

await client.close();
