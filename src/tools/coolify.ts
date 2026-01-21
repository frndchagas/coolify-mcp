import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z as zod } from "zod";
import { COOLIFY_ALLOW_WRITE } from "../config.js";
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

  // ============================================
  // Projects, Servers & Environments
  // ============================================

  server.registerTool(
    "listProjects",
    {
      title: "List projects",
      description: "List all Coolify projects. Returns project UUID, name, description, and environments.",
      inputSchema: zod.object({
        limit: zod.number().int().min(1).optional(),
        offset: zod.number().int().min(0).optional(),
      }),
    },
    async ({ limit, offset }) => {
      const data = await unwrap(sdk.listProjects(), "listProjects");
      const items = Array.isArray(data) ? data : [];
      const page = paginate(items, limit, offset);
      return listWithMeta("Projects fetched.", page.items, {
        total: page.total,
        offset: page.offset,
        limit: page.limit,
        hasMore: page.hasMore,
      });
    }
  );

  server.registerTool(
    "createProject",
    {
      title: "Create project",
      description: "Create a new Coolify project. Returns the project UUID.",
      inputSchema: z.zCreateProjectData.shape.body.shape,
    },
    async (body) => {
      requireWrite();
      const data = await unwrap(
        sdk.createProject({ body }),
        "createProject"
      );
      const uuid = isRecord(data) ? data.uuid : undefined;
      return ok(
        uuid ? `Project created with UUID: ${uuid}` : "Project created.",
        data
      );
    }
  );

  server.registerTool(
    "listServers",
    {
      title: "List servers",
      description: "List all Coolify servers. Returns server UUID, name, IP, user, port, and proxy type.",
      inputSchema: zod.object({
        limit: zod.number().int().min(1).optional(),
        offset: zod.number().int().min(0).optional(),
        summary: zod.boolean().optional(),
      }),
    },
    async ({ limit, offset, summary }) => {
      const data = await unwrap(sdk.listServers(), "listServers");
      const items = Array.isArray(data) ? data : [];
      const useSummary = summary ?? true;
      const summarized = useSummary
        ? items.map((item) => {
            if (!isRecord(item)) return item;
            return pickFields(item, ["id", "uuid", "name", "ip", "user", "port", "proxy_type"]);
          })
        : items;
      const page = paginate(summarized, limit, offset);
      return listWithMeta("Servers fetched.", page.items, {
        total: page.total,
        offset: page.offset,
        limit: page.limit,
        hasMore: page.hasMore,
      });
    }
  );

  server.registerTool(
    "getServer",
    {
      title: "Get server",
      description: "Get server details by UUID.",
      inputSchema: z.zGetServerByUuidData.shape.path.shape,
    },
    async ({ uuid }) => {
      const data = await unwrap(
        sdk.getServerByUuid({ path: { uuid } }),
        "getServer"
      );
      return ok(`Server ${uuid} fetched.`, data);
    }
  );

  server.registerTool(
    "listEnvironments",
    {
      title: "List environments",
      description: "List all environments for a project. Requires the project UUID.",
      inputSchema: z.zGetEnvironmentsData.shape.path.shape,
    },
    async ({ uuid }) => {
      const data = await unwrap(
        sdk.getEnvironments({ path: { uuid } }),
        "listEnvironments"
      );
      const items = Array.isArray(data) ? data : [];
      return listWithMeta(`Environments for project ${uuid} fetched.`, items, {
        total: items.length,
      });
    }
  );

  server.registerTool(
    "createEnvironment",
    {
      title: "Create environment",
      description: "Create a new environment in a project. Requires the project UUID.",
      inputSchema: {
        ...z.zCreateEnvironmentData.shape.path.shape,
        ...z.zCreateEnvironmentData.shape.body.shape,
      },
    },
    async ({ uuid, ...body }) => {
      requireWrite();
      const data = await unwrap(
        sdk.createEnvironment({ path: { uuid }, body }),
        "createEnvironment"
      );
      const envUuid = isRecord(data) ? data.uuid : undefined;
      return ok(
        envUuid
          ? `Environment created with UUID: ${envUuid}`
          : "Environment created.",
        data
      );
    }
  );

  server.registerTool(
    "updateProject",
    {
      title: "Update project",
      description: "Update a project's name or description.",
      inputSchema: {
        ...z.zUpdateProjectByUuidData.shape.path.shape,
        ...z.zUpdateProjectByUuidData.shape.body.shape,
      },
    },
    async ({ uuid, ...body }) => {
      requireWrite();
      const data = await unwrap(
        sdk.updateProjectByUuid({ path: { uuid }, body }),
        "updateProject"
      );
      return ok(`Project ${uuid} updated.`, data);
    }
  );

  server.registerTool(
    "deleteProject",
    {
      title: "Delete project",
      description: "Delete a project by UUID. This will delete all environments and resources in the project.",
      inputSchema: z.zDeleteProjectByUuidData.shape.path.shape,
    },
    async ({ uuid }) => {
      requireWrite();
      const data = await unwrap(
        sdk.deleteProjectByUuid({ path: { uuid } }),
        "deleteProject"
      );
      return ok(`Project ${uuid} deleted.`, data);
    }
  );

  server.registerTool(
    "createServer",
    {
      title: "Create server",
      description: "Create a new server. Requires a private key UUID for SSH access.",
      inputSchema: z.zCreateServerData.shape.body.shape,
    },
    async (body) => {
      requireWrite();
      const data = await unwrap(
        sdk.createServer({ body }),
        "createServer"
      );
      const uuid = isRecord(data) ? data.uuid : undefined;
      return ok(
        uuid ? `Server created with UUID: ${uuid}` : "Server created.",
        data
      );
    }
  );

  server.registerTool(
    "validateServer",
    {
      title: "Validate server",
      description: "Validate server connection and configuration by UUID.",
      inputSchema: z.zValidateServerByUuidData.shape.path.shape,
    },
    async ({ uuid }) => {
      const data = await unwrap(
        sdk.validateServerByUuid({ path: { uuid } }),
        "validateServer"
      );
      return ok(`Server ${uuid} validation started.`, data);
    }
  );

  // ============================================
  // Private Keys (Security)
  // ============================================

  server.registerTool(
    "listPrivateKeys",
    {
      title: "List private keys",
      description: "List all SSH private keys. Keys are used for server authentication and deploy keys.",
      inputSchema: zod.object({
        limit: zod.number().int().min(1).optional(),
        offset: zod.number().int().min(0).optional(),
      }),
    },
    async ({ limit, offset }) => {
      const data = await unwrap(sdk.listPrivateKeys(), "listPrivateKeys");
      const items = Array.isArray(data) ? data : [];
      const summarized = items.map((item) => {
        if (!isRecord(item)) return item;
        return pickFields(item, ["id", "uuid", "name", "description", "is_git_related"]);
      });
      const page = paginate(summarized, limit, offset);
      return listWithMeta("Private keys fetched.", page.items, {
        total: page.total,
        offset: page.offset,
        limit: page.limit,
        hasMore: page.hasMore,
      });
    }
  );

  server.registerTool(
    "createPrivateKey",
    {
      title: "Create private key",
      description: "Create a new SSH private key. The private_key field should contain the full PEM-encoded key.",
      inputSchema: z.zCreatePrivateKeyData.shape.body.shape,
    },
    async (body) => {
      requireWrite();
      const data = await unwrap(
        sdk.createPrivateKey({ body }),
        "createPrivateKey"
      );
      const uuid = isRecord(data) ? data.uuid : undefined;
      return ok(
        uuid ? `Private key created with UUID: ${uuid}` : "Private key created.",
        data
      );
    }
  );

  // ============================================
  // GitHub Apps
  // ============================================

  server.registerTool(
    "listGithubApps",
    {
      title: "List GitHub Apps",
      description: "List all configured GitHub Apps. Used for private repository access.",
      inputSchema: zod.object({
        limit: zod.number().int().min(1).optional(),
        offset: zod.number().int().min(0).optional(),
      }),
    },
    async ({ limit, offset }) => {
      const data = await unwrap(sdk.listGithubApps(), "listGithubApps");
      const items = Array.isArray(data) ? data : [];
      const summarized = items.map((item) => {
        if (!isRecord(item)) return item;
        return pickFields(item, ["id", "uuid", "name", "organization", "app_id", "installation_id", "is_public"]);
      });
      const page = paginate(summarized, limit, offset);
      return listWithMeta("GitHub Apps fetched.", page.items, {
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
      }),
    },
    async ({ limit, offset }) => {
      const data = await unwrap(sdk.listDeployments(), "listDeployments");
      const items = normalizeItems(data);
      if (!items) {
        return list("Running deployments fetched.", parseMaybeJson(data));
      }
      const page = paginate(items, limit, offset);
      return listWithMeta("Running deployments fetched.", page.items, {
        total: page.total,
        offset: page.offset,
        limit: page.limit,
        hasMore: page.hasMore,
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
      },
    },
    async ({ uuid, ...query }) => {
      const data = await unwrap(
        sdk.listDeploymentsByAppUuid({ path: { uuid }, query }),
        "listAppDeployments"
      );
      const items = normalizeItems(data) ?? parseMaybeJson(data);
      return listWithMeta(`Deployments for ${uuid} fetched.`, items, {});
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
      inputSchema: z.zGetDeploymentByUuidData.shape.path.shape,
    },
    async ({ uuid }) => {
      const data = await unwrap(
        sdk.getDeploymentByUuid({ path: { uuid } }),
        "getDeployment"
      );
      return ok(`Deployment ${uuid} fetched.`, data);
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
      },
    },
    async ({ uuid, ...query }) => {
      const data = await unwrap(
        sdk.getApplicationLogsByUuid({ path: { uuid }, query }),
        "getLogs"
      );
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
    "deleteEnv",
    {
      title: "Delete env var",
      description: "Delete an environment variable from an application by env UUID.",
      inputSchema: z.zDeleteEnvByApplicationUuidData.shape.path.shape,
    },
    async ({ uuid, env_uuid }) => {
      requireWrite();
      const data = await unwrap(
        sdk.deleteEnvByApplicationUuid({ path: { uuid, env_uuid } }),
        "deleteEnv"
      );
      return ok(`Env var ${env_uuid} deleted from application ${uuid}.`, data);
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

  // ============================================
  // Application Creation Tools
  // ============================================

  server.registerTool(
    "createPublicApplication",
    {
      title: "Create public git application",
      description:
        "Create a new application based on a public git repository. Requires project_uuid, server_uuid, environment_name (or environment_uuid), git_repository, git_branch, build_pack, and ports_exposes.",
      inputSchema: z.zCreatePublicApplicationData.shape.body.shape,
    },
    async (body) => {
      requireWrite();
      const data = await unwrap(
        sdk.createPublicApplication({ body }),
        "createPublicApplication"
      );
      const uuid = isRecord(data) ? data.uuid : undefined;
      return ok(
        uuid ? `Application created with UUID: ${uuid}` : "Application created.",
        data
      );
    }
  );

  server.registerTool(
    "createPrivateGithubAppApplication",
    {
      title: "Create private GitHub App application",
      description:
        "Create a new application using a private GitHub App. Requires project_uuid, server_uuid, environment_name (or environment_uuid), github_app_uuid, git_repository, git_branch, build_pack, and ports_exposes.",
      inputSchema: z.zCreatePrivateGithubAppApplicationData.shape.body.shape,
    },
    async (body) => {
      requireWrite();
      const data = await unwrap(
        sdk.createPrivateGithubAppApplication({ body }),
        "createPrivateGithubAppApplication"
      );
      const uuid = isRecord(data) ? data.uuid : undefined;
      return ok(
        uuid ? `Application created with UUID: ${uuid}` : "Application created.",
        data
      );
    }
  );

  server.registerTool(
    "createPrivateDeployKeyApplication",
    {
      title: "Create private deploy key application",
      description:
        "Create a new application using a private SSH deploy key. Requires project_uuid, server_uuid, environment_name (or environment_uuid), private_key_uuid, git_repository, git_branch, build_pack, and ports_exposes.",
      inputSchema: z.zCreatePrivateDeployKeyApplicationData.shape.body.shape,
    },
    async (body) => {
      requireWrite();
      const data = await unwrap(
        sdk.createPrivateDeployKeyApplication({ body }),
        "createPrivateDeployKeyApplication"
      );
      const uuid = isRecord(data) ? data.uuid : undefined;
      return ok(
        uuid ? `Application created with UUID: ${uuid}` : "Application created.",
        data
      );
    }
  );

  server.registerTool(
    "createDockerfileApplication",
    {
      title: "Create Dockerfile application",
      description:
        "Create a new application from a Dockerfile. Requires project_uuid, server_uuid, environment_name (or environment_uuid), and dockerfile content.",
      inputSchema: z.zCreateDockerfileApplicationData.shape.body.shape,
    },
    async (body) => {
      requireWrite();
      const data = await unwrap(
        sdk.createDockerfileApplication({ body }),
        "createDockerfileApplication"
      );
      const uuid = isRecord(data) ? data.uuid : undefined;
      return ok(
        uuid ? `Application created with UUID: ${uuid}` : "Application created.",
        data
      );
    }
  );

  server.registerTool(
    "createDockerImageApplication",
    {
      title: "Create Docker image application",
      description:
        "Create a new application from a prebuilt Docker image. Requires project_uuid, server_uuid, environment_name (or environment_uuid), docker_registry_image_name, and ports_exposes.",
      inputSchema: z.zCreateDockerimageApplicationData.shape.body.shape,
    },
    async (body) => {
      requireWrite();
      const data = await unwrap(
        sdk.createDockerimageApplication({ body }),
        "createDockerImageApplication"
      );
      const uuid = isRecord(data) ? data.uuid : undefined;
      return ok(
        uuid ? `Application created with UUID: ${uuid}` : "Application created.",
        data
      );
    }
  );

  server.registerTool(
    "createDockerComposeApplication",
    {
      title: "Create Docker Compose application",
      description:
        "Create a new application from Docker Compose. Requires project_uuid, server_uuid, environment_name (or environment_uuid), and docker_compose_raw (YAML content).",
      inputSchema: z.zCreateDockercomposeApplicationData.shape.body.shape,
    },
    async (body) => {
      requireWrite();
      const data = await unwrap(
        sdk.createDockercomposeApplication({ body }),
        "createDockerComposeApplication"
      );
      const uuid = isRecord(data) ? data.uuid : undefined;
      return ok(
        uuid ? `Application created with UUID: ${uuid}` : "Application created.",
        data
      );
    }
  );

  // ============================================
  // Application Management Tools
  // ============================================

  server.registerTool(
    "updateApplication",
    {
      title: "Update application",
      description: "Update an application's configuration by UUID.",
      inputSchema: {
        ...z.zUpdateApplicationByUuidData.shape.path.shape,
        ...z.zUpdateApplicationByUuidData.shape.body.shape,
      },
    },
    async ({ uuid, ...body }) => {
      requireWrite();
      const data = await unwrap(
        sdk.updateApplicationByUuid({ path: { uuid }, body }),
        "updateApplication"
      );
      return ok(`Application ${uuid} updated.`, redactSecrets(data));
    }
  );

  server.registerTool(
    "deleteApplication",
    {
      title: "Delete application",
      description: "Delete an application by UUID. Optionally delete volumes, configurations, and connected networks.",
      inputSchema: {
        ...z.zDeleteApplicationByUuidData.shape.path.shape,
        ...z.zDeleteApplicationByUuidData.shape.query.unwrap().shape,
      },
    },
    async ({ uuid, ...query }) => {
      requireWrite();
      const data = await unwrap(
        sdk.deleteApplicationByUuid({ path: { uuid }, query }),
        "deleteApplication"
      );
      return ok(`Application ${uuid} deleted.`, data);
    }
  );

  server.registerTool(
    "startApplication",
    {
      title: "Start application",
      description: "Start an application by UUID. Optionally force rebuild.",
      inputSchema: {
        ...z.zStartApplicationByUuidData.shape.path.shape,
        ...z.zStartApplicationByUuidData.shape.query.unwrap().shape,
      },
    },
    async ({ uuid, ...query }) => {
      requireWrite();
      const data = await unwrap(
        sdk.startApplicationByUuid({ path: { uuid }, query }),
        "startApplication"
      );
      return ok(`Application ${uuid} start initiated.`, data);
    }
  );

  server.registerTool(
    "stopApplication",
    {
      title: "Stop application",
      description: "Stop an application by UUID.",
      inputSchema: z.zStopApplicationByUuidData.shape.path.shape,
    },
    async ({ uuid }) => {
      requireWrite();
      const data = await unwrap(
        sdk.stopApplicationByUuid({ path: { uuid } }),
        "stopApplication"
      );
      return ok(`Application ${uuid} stopped.`, data);
    }
  );

  server.registerTool(
    "restartApplication",
    {
      title: "Restart application",
      description: "Restart an application by UUID.",
      inputSchema: z.zRestartApplicationByUuidData.shape.path.shape,
    },
    async ({ uuid }) => {
      requireWrite();
      const data = await unwrap(
        sdk.restartApplicationByUuid({ path: { uuid } }),
        "restartApplication"
      );
      return ok(`Application ${uuid} restarted.`, data);
    }
  );

  // ============================================
  // Services
  // ============================================

  server.registerTool(
    "listServices",
    {
      title: "List services",
      description: "List all Coolify services (one-click apps like databases, caches, etc.).",
      inputSchema: zod.object({
        limit: zod.number().int().min(1).optional(),
        offset: zod.number().int().min(0).optional(),
        summary: zod.boolean().optional(),
      }),
    },
    async ({ limit, offset, summary }) => {
      const data = await unwrap(sdk.listServices(), "listServices");
      const items = Array.isArray(data) ? data : [];
      const useSummary = summary ?? true;
      const summarized = useSummary
        ? items.map((item) => {
            if (!isRecord(item)) return item;
            return pickFields(item, ["id", "uuid", "name", "status", "server_id"]);
          })
        : items;
      const redacted = redactSecrets(summarized);
      const page = paginate(redacted as typeof summarized, limit, offset);
      return listWithMeta("Services fetched.", page.items, {
        total: page.total,
        offset: page.offset,
        limit: page.limit,
        hasMore: page.hasMore,
      });
    }
  );

  server.registerTool(
    "createService",
    {
      title: "Create service",
      description: "Create a new one-click service (database, cache, etc.). Requires type, name, project_uuid, server_uuid, and environment_name.",
      inputSchema: z.zCreateServiceData.shape.body.shape,
    },
    async (body) => {
      requireWrite();
      const data = await unwrap(
        sdk.createService({ body }),
        "createService"
      );
      const uuid = isRecord(data) ? data.uuid : undefined;
      return ok(
        uuid ? `Service created with UUID: ${uuid}` : "Service created.",
        data
      );
    }
  );
}
