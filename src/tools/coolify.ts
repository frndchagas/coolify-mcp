import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z as zod } from "zod";
import { COOLIFY_ALLOW_UNSAFE_LOGS, COOLIFY_ALLOW_WRITE } from "../config.js";
import * as sdk from "../generated/sdk.gen.js";
import * as z from "../generated/zod.gen.js";

function extractErrorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null) {
    if ("message" in error) {
      return String((error as { message: unknown }).message);
    }
    try {
      return JSON.stringify(error);
    } catch {
      return "API request failed";
    }
  }
  return "API request failed";
}

function isHtmlResponse(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim().toLowerCase();
  return trimmed.startsWith("<!doctype html") || trimmed.startsWith("<html");
}

async function unwrap<T>(
  promise: Promise<{ data?: T; error?: unknown }>,
  context?: string
): Promise<T> {
  const result = await promise;
  if (result.error) {
    const msg = extractErrorMessage(result.error);
    const prefix = context ? `${context}: ` : "";
    throw new Error(`${prefix}${msg}`);
  }
  if (isHtmlResponse(result.data)) {
    const prefix = context ? `${context}: ` : "";
    throw new Error(
      `${prefix}Authentication failed. API returned HTML instead of JSON. Please check COOLIFY_TOKEN and COOLIFY_BASE_URL.`
    );
  }
  return result.data as T;
}

// Convert any data to Record for structuredContent (single conversion point)
function toRecord(data: unknown): Record<string, unknown> {
  if (data === null || data === undefined) return {};
  if (typeof data === "object" && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  // Wrap primitives and arrays in a data property
  return { data };
}

const ok = (text: string, data: unknown) => ({
  content: [{ type: "text" as const, text }],
  structuredContent: toRecord(data),
});

const list = (text: string, items: unknown) => ok(text, { items });
const listWithMeta = (
  text: string,
  items: unknown,
  meta?: Record<string, unknown>
) => ok(text, meta ? { items, meta } : { items });

function requireWrite() {
  if (!COOLIFY_ALLOW_WRITE) {
    throw new Error(
      "Write operations are disabled (COOLIFY_ALLOW_WRITE=false)."
    );
  }
}

const SECRET_MASK = "********";
const RESOURCE_TYPE_KEYS = ["type", "resource_type", "resourceable_type", "kind"];
const RESOURCE_STATUS_KEYS = ["status", "state"];
const DATABASE_TYPE_KEYS = ["type", "database_type", "kind"];
const SENSITIVE_KEY_PATTERN =
  /(pass(word)?|secret|token|api[_-]?key|private[_-]?key|access[_-]?key|credential|connection|string|dsn)/i;
const URL_KEY_PATTERN = /(url|uri|dsn)/i;
const LOG_FIELD_PATTERN = /(log|logs|stdout|stderr|output|command|cmd|args)/i;
const LOG_MODE_VALUES = ["safe", "strict", "raw"] as const;
type LogMode = (typeof LOG_MODE_VALUES)[number];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function normalizeItems(value: unknown): unknown[] | null {
  const parsed = parseMaybeJson(value);
  if (Array.isArray(parsed)) return parsed;
  if (isRecord(parsed) && Array.isArray(parsed.items)) return parsed.items;
  return null;
}

function normalizeString(value: string): string {
  return value.trim().toLowerCase();
}

function matchesAnyField(
  item: unknown,
  keys: string[],
  expected?: string
): boolean {
  if (!expected) return true;
  if (!isRecord(item)) return false;
  const expectedValue = normalizeString(expected);
  for (const key of keys) {
    const raw = item[key];
    if (typeof raw === "string" && normalizeString(raw) === expectedValue) {
      return true;
    }
    if (typeof raw === "number" && String(raw) === expectedValue) {
      return true;
    }
  }
  return false;
}

function paginate<T>(items: T[], limit?: number, offset?: number) {
  const safeOffset = Math.max(0, offset ?? 0);
  if (limit === undefined) {
    return {
      items: items.slice(safeOffset),
      total: items.length,
      offset: safeOffset,
      hasMore: false,
    };
  }
  const safeLimit = Math.max(1, limit);
  return {
    items: items.slice(safeOffset, safeOffset + safeLimit),
    total: items.length,
    offset: safeOffset,
    limit: safeLimit,
    hasMore: safeOffset + safeLimit < items.length,
  };
}

function pickFields(
  source: Record<string, unknown>,
  fields: string[]
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    if (field in source) {
      result[field] = source[field];
    }
  }
  return result;
}

function summarizeResource(item: unknown): unknown {
  if (!isRecord(item)) return item;
  const summary = pickFields(item, ["id", "name", "status", "type"]);
  return Object.keys(summary).length > 0 ? summary : item;
}

function maskEnvValue(value: unknown): unknown {
  if (value === undefined || value === null) return value;
  return SECRET_MASK;
}

function maskEnvVar(item: unknown): unknown {
  if (!isRecord(item)) return item;
  const hasValue = item.value !== undefined || item.real_value !== undefined;
  return {
    ...item,
    value: maskEnvValue(item.value),
    real_value: maskEnvValue(item.real_value),
    ...(hasValue ? { is_secret: true } : {}),
  };
}

function hasCredentialInUrl(value: string): boolean {
  return /:\/\/[^/]+@/.test(value);
}

function shouldRedactField(key: string, value: unknown): boolean {
  if (SENSITIVE_KEY_PATTERN.test(key)) return true;
  if (
    URL_KEY_PATTERN.test(key) &&
    typeof value === "string" &&
    hasCredentialInUrl(value)
  ) {
    return true;
  }
  return false;
}

function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => redactSecrets(item));
  if (!isRecord(value)) return value;
  const result: Record<string, unknown> = {};
  for (const [key, fieldValue] of Object.entries(value)) {
    if (shouldRedactField(key, fieldValue)) {
      result[key] = SECRET_MASK;
      continue;
    }
    result[key] = redactSecrets(fieldValue);
  }
  return result;
}

const LOG_REDACTIONS: Array<{ pattern: RegExp; replacement: string }> = [
  {
    pattern:
      /(\b[A-Z0-9_]*?(?:PASSWORD|PASS|SECRET|TOKEN|API_KEY|ACCESS_KEY|PRIVATE_KEY)[A-Z0-9_]*\b\s*=\s*)(["']?)([^"'\s]+)\2/gi,
    replacement: `$1$2${SECRET_MASK}$2`,
  },
  {
    pattern:
      /(\b(?:password|pass|secret|token|api[_-]?key|access[_-]?key|private[_-]?key)\b\s*:\s*)([^,\s]+)/gi,
    replacement: `$1${SECRET_MASK}`,
  },
  {
    pattern:
      /(\"(?:password|pass|secret|token|api[_-]?key|access[_-]?key|private[_-]?key)\"\\s*:\\s*\")([^\"]*)(\")/gi,
    replacement: `$1${SECRET_MASK}$3`,
  },
  {
    pattern: /(Authorization:\s*Bearer\s+)([^\s]+)/gi,
    replacement: `$1${SECRET_MASK}`,
  },
  {
    pattern:
      /(--?(?:token|password|secret|api[-_]?key|access[-_]?key|private[-_]?key)\s*=?)([^\s]+)/gi,
    replacement: `$1${SECRET_MASK}`,
  },
  {
    pattern:
      /([?&](?:token|access_token|api[_-]?key|apikey|secret|password|key)=)([^&\s]+)/gi,
    replacement: `$1${SECRET_MASK}`,
  },
  {
    pattern:
      /(\"[^\"]*(?:password|pass|secret|token|api[_-]?key|access[_-]?key|private[_-]?key|_key|_secret)[^\"]*\"\\s*:\\s*\")([^\"]*)(\")/gi,
    replacement: `$1${SECRET_MASK}$3`,
  },
  {
    pattern:
      /(\b[^\s:]+(?:password|pass|secret|token|api[_-]?key|access[_-]?key|private[_-]?key|_key|_secret)\b\s*:\s*)([^,\s]+)/gi,
    replacement: `$1${SECRET_MASK}`,
  },
  {
    pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{10,}|github_pat_[A-Za-z0-9_]{10,})\b/g,
    replacement: SECRET_MASK,
  },
  {
    pattern: /((?:[a-z]+):\/\/)([^/\s:@]+):([^@/\s]+)@/gi,
    replacement: `$1${SECRET_MASK}:${SECRET_MASK}@`,
  },
  {
    pattern: /((?:[a-z]+):\/\/)([^/\s:@]+)@/gi,
    replacement: `$1${SECRET_MASK}@`,
  },
  {
    pattern: /(x-access-token:)([^@/\s]+)/gi,
    replacement: `$1${SECRET_MASK}`,
  },
];

const ENV_ASSIGNMENT_RE =
  /(^|[\s;&|()])(export\s+)?([A-Za-z_][A-Za-z0-9_]{1,})\s*=\s*(\"[^\"]*\"|'[^']*'|[^\s]+)/g;
const ENV_ASSIGNMENT_TEST_RE =
  /(^|[\s;&|()])(export\s+)?[A-Za-z_][A-Za-z0-9_]{1,}\s*=\s*(\"[^\"]*\"|'[^']*'|[^\s]+)/;
const DOCKER_ENV_ASSIGNMENT_RE =
  /(^|[\s;&|()])ENV\s+([A-Za-z_][A-Za-z0-9_]{1,})\s*=\s*(\"[^\"]*\"|'[^']*'|[^\s]+)/gi;
const DOCKER_ENV_SPACE_RE =
  /(^|[\s;&|()])ENV\s+([A-Za-z_][A-Za-z0-9_]{1,})\s+([^\s]+)/gi;
const ARG_ASSIGNMENT_RE =
  /(^|[\s;&|()])ARG\s+([A-Za-z_][A-Za-z0-9_]{1,})\s*=\s*(\"[^\"]*\"|'[^']*'|[^\s]+)/gi;
const ARG_SPACE_RE =
  /(^|[\s;&|()])ARG\s+([A-Za-z_][A-Za-z0-9_]{1,})\s+([^\s]+)/gi;
const DOCKER_ENV_TEST_RE =
  /(^|[\s;&|()])ENV\s+[A-Za-z_][A-Za-z0-9_]{1,}\s*(=|\s+)/i;
const ARG_TEST_RE =
  /(^|[\s;&|()])ARG\s+[A-Za-z_][A-Za-z0-9_]{1,}\s*(=|\s+)/i;
const BUILD_ARG_RE = /(--build-arg\s+[A-Z0-9_]{2,}\s*=\s*)([^\s]+)/gi;
const BUILD_ARG_TEST_RE = /--build-arg\s+[A-Z0-9_]{2,}\s*=\s*[^\s]+/i;
const URL_TOKEN_TEST_RE =
  /[?&](?:token|access_token|api[_-]?key|apikey|secret|password|key)=/i;
const AUTH_HEADER_TEST_RE = /(authorization:\s*bearer|x-access-token)/i;
const JWT_RE =
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/;
const LONG_HEX_RE = /\b[a-f0-9]{32,}\b/i;
const LONG_BASE64_RE = /\b[A-Za-z0-9+\/]{30,}={0,2}\b/;
const LONG_BASE64URL_RE = /\b[A-Za-z0-9_-]{30,}\b/;

function redactLogLine(line: string): string {
  let output = LOG_REDACTIONS.reduce(
    (value, rule) => value.replace(rule.pattern, rule.replacement),
    line
  );
  output = output.replace(
    ENV_ASSIGNMENT_RE,
    (_match, prefix, exportKeyword, key, value) => {
      const lead = `${prefix ?? ""}${exportKeyword ?? ""}${key}=`.trimStart();
      if (typeof value === "string") {
        if (value.startsWith('"') && value.endsWith('"')) {
          return `${prefix ?? ""}${exportKeyword ?? ""}${key}="${SECRET_MASK}"`;
        }
        if (value.startsWith("'") && value.endsWith("'")) {
          return `${prefix ?? ""}${exportKeyword ?? ""}${key}='${SECRET_MASK}'`;
        }
      }
      return `${prefix ?? ""}${exportKeyword ?? ""}${key}=${SECRET_MASK}`;
    }
  );
  output = output.replace(
    DOCKER_ENV_ASSIGNMENT_RE,
    (_match, prefix, key, value) =>
      `${prefix ?? ""}ENV ${key}=${SECRET_MASK}`
  );
  output = output.replace(
    DOCKER_ENV_SPACE_RE,
    (_match, prefix, key) => `${prefix ?? ""}ENV ${key} ${SECRET_MASK}`
  );
  output = output.replace(
    ARG_ASSIGNMENT_RE,
    (_match, prefix, key) => `${prefix ?? ""}ARG ${key}=${SECRET_MASK}`
  );
  output = output.replace(
    ARG_SPACE_RE,
    (_match, prefix, key) => `${prefix ?? ""}ARG ${key} ${SECRET_MASK}`
  );
  output = output.replace(BUILD_ARG_RE, `$1${SECRET_MASK}`);
  return output;
}

function resolveLogMode(mode?: string): LogMode {
  if (mode === "strict" || mode === "raw" || mode === "safe") return mode;
  return "safe";
}

function assertRawLogsAllowed(mode: LogMode) {
  if (mode === "raw" && !COOLIFY_ALLOW_UNSAFE_LOGS) {
    throw new Error(
      "Raw logs are disabled. Set COOLIFY_ALLOW_UNSAFE_LOGS=true to allow."
    );
  }
}

function isSensitiveLogLine(line: string, mode: LogMode): boolean {
  const basic =
    ENV_ASSIGNMENT_TEST_RE.test(line) ||
    DOCKER_ENV_TEST_RE.test(line) ||
    ARG_TEST_RE.test(line) ||
    BUILD_ARG_TEST_RE.test(line) ||
    URL_TOKEN_TEST_RE.test(line) ||
    AUTH_HEADER_TEST_RE.test(line) ||
    (SENSITIVE_KEY_PATTERN.test(line) && /[:=]/.test(line)) ||
    JWT_RE.test(line);
  if (mode === "safe") return basic;
  return (
    basic ||
    LONG_HEX_RE.test(line) ||
    LONG_BASE64_RE.test(line) ||
    LONG_BASE64URL_RE.test(line)
  );
}

function redactLogString(input: string, mode: LogMode): string {
  if (mode === "raw") return input;
  return input
    .split(/\r?\n/)
    .map((line) => {
      if (isSensitiveLogLine(line, mode)) {
        return "[REDACTED LINE]";
      }
      return redactLogLine(line);
    })
    .join("\n");
}

function stripLogFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => stripLogFields(item));
  if (!isRecord(value)) return value;
  const result: Record<string, unknown> = {};
  for (const [key, fieldValue] of Object.entries(value)) {
    if (LOG_FIELD_PATTERN.test(key)) continue;
    result[key] = stripLogFields(fieldValue);
  }
  return result;
}

function redactLogFields(value: unknown, mode: LogMode): unknown {
  if (Array.isArray(value))
    return value.map((item) => redactLogFields(item, mode));
  if (!isRecord(value)) return value;
  const result: Record<string, unknown> = {};
  for (const [key, fieldValue] of Object.entries(value)) {
    if (LOG_FIELD_PATTERN.test(key)) {
      if (typeof fieldValue === "string") {
        result[key] = redactLogString(fieldValue, mode);
        continue;
      }
      if (Array.isArray(fieldValue)) {
        result[key] = fieldValue.map((entry) =>
          typeof entry === "string"
            ? redactLogString(entry, mode)
            : redactLogFields(entry, mode)
        );
        continue;
      }
    }
    result[key] = redactLogFields(fieldValue, mode);
  }
  return result;
}

function summarizeApplication(item: unknown): unknown {
  if (!isRecord(item)) return item;
  const summary = pickFields(item, ["id", "uuid", "name", "status", "fqdn"]);
  return Object.keys(summary).length > 0 ? summary : item;
}

function summarizeDatabase(item: unknown): unknown {
  if (!isRecord(item)) return item;
  const summary = pickFields(item, [
    "id",
    "uuid",
    "name",
    "status",
    "type",
    "database_type",
    "host",
    "port",
  ]);
  return Object.keys(summary).length > 0 ? summary : item;
}

export function registerCoolifyTools(server: McpServer) {
  server.registerTool(
    "listResources",
    {
      title: "List resources",
      description:
        "List Coolify resources with optional pagination, summary, and filters.",
      inputSchema: zod.object({
        limit: zod.number().int().min(1).optional(),
        offset: zod.number().int().min(0).optional(),
        summary: zod.boolean().optional(),
        type: zod.string().optional(),
        status: zod.string().optional(),
      }),
    },
    async ({ limit, offset, summary, type, status }) => {
      const data = await unwrap(sdk.listResources(), "listResources");
      const items = normalizeItems(data);
      if (!items) {
        return list("Resources fetched.", parseMaybeJson(data));
      }
      const filtered = items.filter(
        (item) =>
          matchesAnyField(item, RESOURCE_TYPE_KEYS, type) &&
          matchesAnyField(item, RESOURCE_STATUS_KEYS, status)
      );
      const summarized = summary
        ? filtered.map((item) => summarizeResource(item))
        : filtered;
      const page = paginate(summarized, limit, offset);
      return listWithMeta("Resources fetched.", page.items, {
        total: page.total,
        offset: page.offset,
        limit: page.limit,
        hasMore: page.hasMore,
      });
    }
  );

  server.registerTool(
    "listApplications",
    {
      title: "List applications",
      description: "List all Coolify applications.",
      inputSchema: zod.object({
        limit: zod.number().int().min(1).optional(),
        offset: zod.number().int().min(0).optional(),
        summary: zod.boolean().optional(),
      }),
    },
    async ({ limit, offset, summary }) => {
      const data = await unwrap(sdk.listApplications(), "listApplications");
      const items = normalizeItems(data);
      if (!items) {
        const parsed = parseMaybeJson(data);
        const redacted = redactSecrets(parsed);
        return list("Applications fetched.", redacted);
      }
      const useSummary = summary ?? true;
      const summarized = useSummary
        ? items.map((item) => summarizeApplication(item))
        : items;
      const redacted = redactSecrets(summarized);
      const page = paginate(redacted as typeof summarized, limit, offset);
      return listWithMeta("Applications fetched.", page.items, {
        total: page.total,
        offset: page.offset,
        limit: page.limit,
        hasMore: page.hasMore,
      });
    }
  );

  server.registerTool(
    "listDatabases",
    {
      title: "List databases",
      description: "List databases with optional pagination and filters.",
      inputSchema: zod.object({
        limit: zod.number().int().min(1).optional(),
        offset: zod.number().int().min(0).optional(),
        type: zod.string().optional(),
        showSecrets: zod.boolean().optional(),
        summary: zod.boolean().optional(),
      }),
    },
    async ({ limit, offset, type, showSecrets, summary }) => {
      const data = await unwrap(sdk.listDatabases(), "listDatabases");
      const items = normalizeItems(data);
      if (!items) {
        return list("Databases fetched.", parseMaybeJson(data));
      }
      const filtered = items.filter((item) =>
        matchesAnyField(item, DATABASE_TYPE_KEYS, type)
      );
      const useSummary = summary ?? true;
      const summarized = useSummary
        ? filtered.map((item) => summarizeDatabase(item))
        : filtered;
      const sanitized = showSecrets
        ? summarized
        : summarized.map((item) => redactSecrets(item));
      const page = paginate(sanitized, limit, offset);
      return listWithMeta("Databases fetched.", page.items, {
        total: page.total,
        offset: page.offset,
        limit: page.limit,
        hasMore: page.hasMore,
        secretsMasked: !showSecrets,
      });
    }
  );

  server.registerTool(
    "listDeployments",
    {
      title: "List deployments",
      description: "List currently running deployments.",
      inputSchema: zod.object({
        limit: zod.number().int().min(1).optional(),
        offset: zod.number().int().min(0).optional(),
        includeLogs: zod.boolean().optional(),
        logMode: zod.enum(LOG_MODE_VALUES).optional(),
      }),
    },
    async ({ limit, offset, includeLogs, logMode }) => {
      const resolvedLogMode = resolveLogMode(logMode);
      assertRawLogsAllowed(resolvedLogMode);
      const data = await unwrap(sdk.listDeployments(), "listDeployments");
      const items = normalizeItems(data);
      if (!items) {
        const parsed = parseMaybeJson(data);
        const sanitized = includeLogs
          ? redactLogFields(parsed, resolvedLogMode)
          : stripLogFields(parsed);
        const redacted = redactSecrets(sanitized);
        return list("Running deployments fetched.", redacted);
      }
      const sanitized = includeLogs
        ? items.map((item) => redactLogFields(item, resolvedLogMode))
        : items.map((item) => stripLogFields(item));
      const redacted = redactSecrets(sanitized);
      const page = paginate(redacted as typeof sanitized, limit, offset);
      return listWithMeta("Running deployments fetched.", page.items, {
        total: page.total,
        offset: page.offset,
        limit: page.limit,
        hasMore: page.hasMore,
        logsStripped: !includeLogs,
      });
    }
  );

  server.registerTool(
    "listEnvs",
    {
      title: "List env vars",
      description:
        "List environment variables for an application (secrets masked by default).",
      inputSchema: z.zListEnvsByApplicationUuidData.shape.path.extend({
        showSecrets: zod.boolean().optional(),
      }),
    },
    async ({ uuid, showSecrets }) => {
      const envs = await unwrap(
        sdk.listEnvsByApplicationUuid({ path: { uuid } }),
        "listEnvs"
      );
      if (showSecrets) {
        return listWithMeta(
          `Env vars for ${uuid} fetched. WARNING: showSecrets=true returns plaintext secrets.`,
          envs,
          { showSecrets: true }
        );
      }
      if (!Array.isArray(envs)) {
        return listWithMeta(`Env vars for ${uuid} fetched.`, envs, {
          secretsMasked: true,
        });
      }
      return listWithMeta(
        `Env vars for ${uuid} fetched. Secrets masked by default.`,
        envs.map((env) => maskEnvVar(env)),
        { secretsMasked: true }
      );
    }
  );

  server.registerTool(
    "listAppDeployments",
    {
      title: "List app deployments",
      description:
        "List deployments for an application with pagination (skip/take).",
      inputSchema: {
        ...z.zListDeploymentsByAppUuidData.shape.path.shape,
        ...z.zListDeploymentsByAppUuidData.shape.query.unwrap().shape,
        includeLogs: zod.boolean().optional(),
        logMode: zod.enum(LOG_MODE_VALUES).optional(),
      },
    },
    async ({ uuid, includeLogs, logMode, ...query }) => {
      const resolvedLogMode = resolveLogMode(logMode);
      assertRawLogsAllowed(resolvedLogMode);
      const data = await unwrap(
        sdk.listDeploymentsByAppUuid({ path: { uuid }, query }),
        "listAppDeployments"
      );
      const parsed = parseMaybeJson(data);
      const items = normalizeItems(data) ?? parsed;
      if (!Array.isArray(items)) {
        const sanitized = includeLogs
          ? redactLogFields(items, resolvedLogMode)
          : stripLogFields(items);
        const redacted = redactSecrets(sanitized);
        return listWithMeta(`Deployments for ${uuid} fetched.`, redacted, {
          logsStripped: !includeLogs,
        });
      }
      const sanitized = includeLogs
        ? items.map((item) => redactLogFields(item, resolvedLogMode))
        : items.map((item) => stripLogFields(item));
      const redacted = redactSecrets(sanitized);
      return listWithMeta(`Deployments for ${uuid} fetched.`, redacted, {
        logsStripped: !includeLogs,
      });
    }
  );

  server.registerTool(
    "getApplication",
    {
      title: "Get application",
      description: "Get application details by UUID (optional field selection).",
      inputSchema: z.zGetApplicationByUuidData.shape.path.extend({
        fields: zod.array(zod.string().min(1)).min(1).optional(),
        showSecrets: zod.boolean().optional(),
      }),
    },
    async ({ uuid, fields, showSecrets }) => {
      const data = await unwrap(
        sdk.getApplicationByUuid({ path: { uuid } }),
        "getApplication"
      );
      const applyRedaction = !showSecrets;
      if (!fields || fields.length === 0) {
        return ok(
          `Application ${uuid} fetched.`,
          applyRedaction ? redactSecrets(data) : data
        );
      }
      if (!isRecord(data)) {
        return ok(`Application ${uuid} fetched.`, data);
      }
      const picked = pickFields(data, fields);
      return ok(
        `Application ${uuid} fetched.`,
        applyRedaction ? redactSecrets(picked) : picked
      );
    }
  );

  server.registerTool(
    "getDatabase",
    {
      title: "Get database",
      description: "Get database details by UUID.",
      inputSchema: z.zGetDatabaseByUuidData.shape.path.extend({
        showSecrets: zod.boolean().optional(),
      }),
    },
    async ({ uuid, showSecrets }) => {
      const data = await unwrap(
        sdk.getDatabaseByUuid({ path: { uuid } }),
        "getDatabase"
      );
      if (showSecrets) {
        return ok(`Database ${uuid} fetched.`, data);
      }
      return ok(
        `Database ${uuid} fetched. Secrets masked by default.`,
        redactSecrets(data)
      );
    }
  );

  server.registerTool(
    "getDeployment",
    {
      title: "Get deployment",
      description: "Get deployment status and logs by UUID.",
      inputSchema: z.zGetDeploymentByUuidData.shape.path.extend({
        includeLogs: zod.boolean().optional(),
        logMode: zod.enum(LOG_MODE_VALUES).optional(),
      }),
    },
    async ({ uuid, includeLogs, logMode }) => {
      const resolvedLogMode = resolveLogMode(logMode);
      assertRawLogsAllowed(resolvedLogMode);
      const data = await unwrap(
        sdk.getDeploymentByUuid({ path: { uuid } }),
        "getDeployment"
      );
      const sanitized = includeLogs
        ? redactLogFields(data, resolvedLogMode)
        : stripLogFields(data);
      const redacted = redactSecrets(sanitized);
      return ok(`Deployment ${uuid} fetched.`, redacted);
    }
  );

  server.registerTool(
    "getLogs",
    {
      title: "Get logs",
      description: "Fetch runtime logs for an application.",
      inputSchema: {
        ...z.zGetApplicationLogsByUuidData.shape.path.shape,
        ...z.zGetApplicationLogsByUuidData.shape.query.unwrap().shape,
        logMode: zod.enum(LOG_MODE_VALUES).optional(),
      },
    },
    async ({ uuid, logMode, ...query }) => {
      const resolvedLogMode = resolveLogMode(logMode);
      assertRawLogsAllowed(resolvedLogMode);
      const data = await unwrap(
        sdk.getApplicationLogsByUuid({ path: { uuid }, query }),
        "getLogs"
      );
      if (data && typeof data === "object" && "logs" in data) {
        const logsValue = (data as { logs?: unknown }).logs;
        if (typeof logsValue === "string") {
          return ok("Logs fetched.", {
            ...data,
            logs:
              resolvedLogMode === "raw"
                ? logsValue
                : redactLogString(logsValue, resolvedLogMode),
          });
        }
      }
      return ok("Logs fetched.", data);
    }
  );

  server.registerTool(
    "createEnv",
    {
      title: "Create env var",
      description: "Create a new environment variable for an application.",
      inputSchema: {
        ...z.zCreateEnvByApplicationUuidData.shape.path.shape,
        ...z.zCreateEnvByApplicationUuidData.shape.body.shape,
      },
    },
    async ({ uuid, ...body }) => {
      requireWrite();
      const data = await unwrap(
        sdk.createEnvByApplicationUuid({ path: { uuid }, body }),
        "createEnv"
      );
      return ok(`Env var ${body.key} created.`, data);
    }
  );

  server.registerTool(
    "upsertEnv",
    {
      title: "Upsert env var",
      description:
        "Create or update an environment variable for an application (by key).",
      inputSchema: zod.object({
        ...z.zCreateEnvByApplicationUuidData.shape.path.shape,
        ...z.zCreateEnvByApplicationUuidData.shape.body.shape,
        key: zod.string().min(1),
        value: zod.string(),
      }),
    },
    async ({ uuid, key, ...body }) => {
      requireWrite();
      const payload = {
        key,
        ...body,
      } as {
        key: string;
        value: string;
        is_preview?: boolean;
        is_literal?: boolean;
        is_multiline?: boolean;
        is_shown_once?: boolean;
      };
      if (payload.value === undefined) {
        throw new Error("upsertEnv: value is required.");
      }
      if (payload.is_preview === undefined) {
        payload.is_preview = false;
      }
      const envs = await unwrap(
        sdk.listEnvsByApplicationUuid({ path: { uuid } }),
        "upsertEnv"
      );
      if (Array.isArray(envs)) {
        let matches = envs.filter((env) => env.key === key);
        matches = matches.filter(
          (env) => env.is_preview === payload.is_preview
        );
        if (matches.length > 1) {
          const options = matches
            .map((env) => `${env.uuid ?? "unknown"} (is_preview=${env.is_preview ?? "unknown"})`)
            .join(", ");
          throw new Error(
            `upsertEnv: Multiple envs found for key ${key} with is_preview=${payload.is_preview}. Options: ${options}`
          );
        }
        if (matches.length > 0) {
          const data = await unwrap(
            sdk.updateEnvByApplicationUuid({ path: { uuid }, body: payload }),
            "upsertEnv:update"
          );
          return ok(`Env var ${key} updated.`, data);
        }
        const data = await unwrap(
          sdk.createEnvByApplicationUuid({ path: { uuid }, body: payload }),
          "upsertEnv:create"
        );
        return ok(`Env var ${key} created.`, data);
      }
      try {
        const data = await unwrap(
          sdk.updateEnvByApplicationUuid({ path: { uuid }, body: payload }),
          "upsertEnv:update"
        );
        return ok(`Env var ${key} updated.`, data);
      } catch {
        const data = await unwrap(
          sdk.createEnvByApplicationUuid({ path: { uuid }, body: payload }),
          "upsertEnv:create"
        );
        return ok(`Env var ${key} created.`, data);
      }
    }
  );

  server.registerTool(
    "updateEnv",
    {
      title: "Update env var",
      description:
        "Update an existing environment variable for an application.",
      inputSchema: {
        ...z.zUpdateEnvByApplicationUuidData.shape.path.shape,
        ...z.zUpdateEnvByApplicationUuidData.shape.body.shape,
      },
    },
    async ({ uuid, ...body }) => {
      requireWrite();
      const data = await unwrap(
        sdk.updateEnvByApplicationUuid({ path: { uuid }, body }),
        "updateEnv"
      );
      return ok(`Env var ${body.key} updated.`, data);
    }
  );

  server.registerTool(
    "deploy",
    {
      title: "Trigger deploy",
      description: "Trigger a deployment for an application by UUID or tag.",
      inputSchema: z.zDeployByTagOrUuidData.shape.query.unwrap().shape,
    },
    async (query) => {
      requireWrite();
      return ok(
        "Deployment triggered.",
        await unwrap(sdk.deployByTagOrUuid({ query }), "deploy")
      );
    }
  );

  server.registerTool(
    "cancelDeployment",
    {
      title: "Cancel deployment",
      description: "Cancel a running deployment by UUID.",
      inputSchema: z.zCancelDeploymentByUuidData.shape.path.shape,
    },
    async ({ uuid }) => {
      requireWrite();
      return ok(
        `Deployment ${uuid} cancelled.`,
        await unwrap(sdk.cancelDeploymentByUuid({ path: { uuid } }), "cancelDeployment")
      );
    }
  );
}
