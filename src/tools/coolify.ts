import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z as zod } from "zod";
import * as sdk from "../generated/sdk.gen.js";
import * as z from "../generated/zod.gen.js";
import {
  confirmDestructive,
  list,
  listWithMeta,
  ok,
  parseBody,
  requireEnvironmentRef,
  requireWrite,
  unwrap,
} from "./common.js";
import {
  DATABASE_TYPE_KEYS,
  RESOURCE_STATUS_KEYS,
  RESOURCE_TYPE_KEYS,
  extractDeploymentLogTail,
  isRecord,
  isTerminalDeploymentStatus,
  maskEnvVar,
  matchesAnyField,
  normalizeItems,
  paginate,
  parseMaybeJson,
  pickFields,
  redactSecrets,
  summarizeApplication,
  summarizeDatabase,
  summarizeResource,
} from "./helpers.js";

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
      await confirmDestructive(
        server,
        `Delete project ${uuid}`,
        "This deletes the project with all its environments and resources. Not recoverable."
      );
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
    "applicationEnvs",
    {
      title: "Manage application env vars",
      description:
        "Manage environment variables for an application. Actions: list (secrets masked unless showSecrets), create, update, upsert (create or update by key), bulk_update (pass envs array), delete (needs env_uuid).",
      inputSchema: {
        uuid: zod.string().describe("Application UUID"),
        action: zod.enum([
          "list",
          "create",
          "update",
          "upsert",
          "bulk_update",
          "delete",
        ]),
        key: zod.string().optional(),
        value: zod.string().optional(),
        env_uuid: zod.string().optional().describe("Required for delete"),
        is_preview: zod.boolean().optional(),
        is_literal: zod.boolean().optional(),
        is_multiline: zod.boolean().optional(),
        envs: zod
          .array(
            zod.object({
              key: zod.string(),
              value: zod.string(),
              is_preview: zod.boolean().optional(),
              is_literal: zod.boolean().optional(),
            })
          )
          .optional()
          .describe("For bulk_update: full list of env vars to apply"),
        showSecrets: zod.boolean().optional(),
      },
    },
    async ({ uuid, action, env_uuid, envs, showSecrets, ...fields }) => {
      const requireKeyValue = () => {
        if (!fields.key || fields.value === undefined) {
          throw new Error(`applicationEnvs(${action}): key and value are required`);
        }
        return { ...fields, key: fields.key, value: fields.value };
      };
      switch (action) {
        case "list": {
          const envList = await unwrap(
            sdk.listEnvsByApplicationUuid({ path: { uuid } }),
            "applicationEnvs(list)"
          );
          if (showSecrets) {
            return listWithMeta(
              `Env vars for ${uuid} fetched. WARNING: showSecrets=true returns plaintext secrets.`,
              envList,
              { showSecrets: true }
            );
          }
          const masked = Array.isArray(envList)
            ? envList.map((env) => maskEnvVar(env))
            : envList;
          return listWithMeta(
            `Env vars for ${uuid} fetched. Secrets masked by default.`,
            masked,
            { secretsMasked: true }
          );
        }
        case "create": {
          requireWrite();
          const body = requireKeyValue();
          const data = await unwrap(
            sdk.createEnvByApplicationUuid({ path: { uuid }, body }),
            "applicationEnvs(create)"
          );
          return ok(`Env var ${body.key} created.`, data);
        }
        case "update": {
          requireWrite();
          const body = requireKeyValue();
          const data = await unwrap(
            sdk.updateEnvByApplicationUuid({ path: { uuid }, body }),
            "applicationEnvs(update)"
          );
          return ok(`Env var ${body.key} updated.`, data);
        }
        case "upsert": {
          requireWrite();
          const payload = requireKeyValue();
          if (payload.is_preview === undefined) {
            payload.is_preview = false;
          }
          const existing = await unwrap(
            sdk.listEnvsByApplicationUuid({ path: { uuid } }),
            "applicationEnvs(upsert)"
          );
          const matches = (Array.isArray(existing) ? existing : []).filter(
            (env) =>
              env.key === payload.key && env.is_preview === payload.is_preview
          );
          if (matches.length > 1) {
            const options = matches
              .map(
                (env) =>
                  `${env.uuid ?? "unknown"} (is_preview=${env.is_preview ?? "unknown"})`
              )
              .join(", ");
            throw new Error(
              `applicationEnvs(upsert): multiple envs found for key ${payload.key} with is_preview=${payload.is_preview}. Options: ${options}`
            );
          }
          if (matches.length === 1) {
            const data = await unwrap(
              sdk.updateEnvByApplicationUuid({ path: { uuid }, body: payload }),
              "applicationEnvs(upsert:update)"
            );
            return ok(`Env var ${payload.key} updated.`, data);
          }
          const data = await unwrap(
            sdk.createEnvByApplicationUuid({ path: { uuid }, body: payload }),
            "applicationEnvs(upsert:create)"
          );
          return ok(`Env var ${payload.key} created.`, data);
        }
        case "bulk_update": {
          requireWrite();
          if (!envs || envs.length === 0) {
            throw new Error("applicationEnvs(bulk_update): envs array is required");
          }
          const data = await unwrap(
            sdk.updateEnvsByApplicationUuid({
              path: { uuid },
              body: { data: envs },
            }),
            "applicationEnvs(bulk_update)"
          );
          return ok(`${envs.length} env vars applied to application ${uuid}.`, data);
        }
        case "delete": {
          requireWrite();
          if (!env_uuid) {
            throw new Error("applicationEnvs(delete): env_uuid is required");
          }
          const data = await unwrap(
            sdk.deleteEnvByApplicationUuid({ path: { uuid, env_uuid } }),
            "applicationEnvs(delete)"
          );
          return ok(`Env var ${env_uuid} deleted from application ${uuid}.`, data);
        }
      }
    }
  );

  server.registerTool(
    "deploy",
    {
      title: "Trigger deploy",
      description:
        "Trigger a deployment for an application by UUID or tag. With wait=true, polls until every triggered deployment reaches a terminal status (finished/failed/cancelled) and returns a log tail for failures — raise your MCP client's tool timeout when waiting on long builds.",
      inputSchema: {
        ...z.zDeployByTagOrUuidData.shape.query.unwrap().shape,
        wait: zod
          .boolean()
          .optional()
          .describe("Poll until the deployment finishes instead of returning immediately"),
        timeout_seconds: zod.number().int().min(10).max(1800).optional(),
      },
    },
    async ({ wait, timeout_seconds, ...query }, extra) => {
      requireWrite();
      const result = await unwrap(sdk.deployByTagOrUuid({ query }), "deploy");
      if (!wait) {
        return ok("Deployment triggered.", result);
      }

      const triggered = isRecord(result) && Array.isArray(result.deployments)
        ? result.deployments
        : [];
      const uuids = triggered
        .map((d) =>
          isRecord(d) && typeof d.deployment_uuid === "string"
            ? d.deployment_uuid
            : null
        )
        .filter((u): u is string => u !== null);
      if (uuids.length === 0) {
        return ok(
          "Deployment triggered, but the API returned no deployment_uuid to wait on.",
          result
        );
      }

      const timeoutMs = (timeout_seconds ?? 600) * 1000;
      const startedAt = Date.now();
      const progressToken = extra._meta?.progressToken;
      const statuses: Record<string, string> = {};
      const pending = new Set(uuids);
      let tick = 0;

      while (pending.size > 0 && Date.now() - startedAt < timeoutMs) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        tick += 1;
        for (const deploymentUuid of [...pending]) {
          const deployment = await unwrap(
            sdk.getDeploymentByUuid({ path: { uuid: deploymentUuid } }),
            "deploy(wait)"
          );
          const status =
            isRecord(deployment) && typeof deployment.status === "string"
              ? deployment.status
              : "unknown";
          statuses[deploymentUuid] = status;
          if (isTerminalDeploymentStatus(status)) {
            pending.delete(deploymentUuid);
          }
        }
        if (progressToken !== undefined) {
          await extra.sendNotification({
            method: "notifications/progress",
            params: {
              progressToken,
              progress: tick,
              message: `Waiting on deployments: ${Object.entries(statuses)
                .map(([id, status]) => `${id}=${status}`)
                .join(", ")}`,
            },
          });
        }
      }

      const summaries: Record<string, unknown>[] = [];
      for (const deploymentUuid of uuids) {
        const status = statuses[deploymentUuid] ?? "unknown";
        const summary: Record<string, unknown> = {
          deployment_uuid: deploymentUuid,
          status,
        };
        if (status === "failed") {
          const deployment = await unwrap(
            sdk.getDeploymentByUuid({ path: { uuid: deploymentUuid } }),
            "deploy(wait)"
          );
          if (isRecord(deployment)) {
            summary.log_tail = extractDeploymentLogTail(deployment.logs);
          }
        }
        summaries.push(summary);
      }

      const timedOut = pending.size > 0;
      const failed = summaries.filter((s) => s.status === "failed").length;
      const text = timedOut
        ? `Deployment wait timed out after ${Math.round((Date.now() - startedAt) / 1000)}s; last statuses: ${Object.values(statuses).join(", ")}.`
        : failed > 0
          ? `Deployment finished with ${failed} failure(s); log tails included.`
          : "Deployment(s) finished successfully.";
      return ok(text, { deployments: summaries, timed_out: timedOut });
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
  // Application Creation
  // ============================================

  const APPLICATION_TYPES = [
    "public",
    "private-github-app",
    "private-deploy-key",
    "dockerfile",
    "dockerimage",
  ] as const;
  type ApplicationType = (typeof APPLICATION_TYPES)[number];

  async function createApplicationByType(
    type: ApplicationType,
    payload: Record<string, unknown>
  ) {
    switch (type) {
      case "public":
        return unwrap(
          sdk.createPublicApplication({
            body: parseBody(
              z.zCreatePublicApplicationData.shape.body,
              payload,
              `createApplication(${type})`
            ),
          }),
          "createApplication"
        );
      case "private-github-app":
        return unwrap(
          sdk.createPrivateGithubAppApplication({
            body: parseBody(
              z.zCreatePrivateGithubAppApplicationData.shape.body,
              payload,
              `createApplication(${type})`
            ),
          }),
          "createApplication"
        );
      case "private-deploy-key":
        return unwrap(
          sdk.createPrivateDeployKeyApplication({
            body: parseBody(
              z.zCreatePrivateDeployKeyApplicationData.shape.body,
              payload,
              `createApplication(${type})`
            ),
          }),
          "createApplication"
        );
      case "dockerfile":
        return unwrap(
          sdk.createDockerfileApplication({
            body: parseBody(
              z.zCreateDockerfileApplicationData.shape.body,
              payload,
              `createApplication(${type})`
            ),
          }),
          "createApplication"
        );
      case "dockerimage":
        return unwrap(
          sdk.createDockerimageApplication({
            body: parseBody(
              z.zCreateDockerimageApplicationData.shape.body,
              payload,
              `createApplication(${type})`
            ),
          }),
          "createApplication"
        );
    }
  }

  server.registerTool(
    "createApplication",
    {
      title: "Create application",
      description:
        "Create a new application. `type` selects the source: 'public' (public git repo), 'private-github-app' (private repo via GitHub App, needs github_app_uuid), 'private-deploy-key' (private repo via SSH deploy key, needs private_key_uuid), 'dockerfile' (raw Dockerfile content in `dockerfile`), 'dockerimage' (prebuilt image, needs docker_registry_image_name and ports_exposes). Git-based types also need git_repository, git_branch, and build_pack. All types need project_uuid, server_uuid, and environment_name or environment_uuid (one is enough). Any other Coolify application field (install/build/start commands, base_directory, health checks, resource limits, ...) can be passed in `extra`; fields not valid for the chosen type are ignored.",
      inputSchema: {
        type: zod.enum(APPLICATION_TYPES).describe("Application source type"),
        project_uuid: zod.string(),
        server_uuid: zod.string(),
        environment_name: zod
          .string()
          .optional()
          .describe("Environment name (or pass environment_uuid)"),
        environment_uuid: zod
          .string()
          .optional()
          .describe("Environment UUID (or pass environment_name)"),
        name: zod.string().optional(),
        description: zod.string().optional(),
        git_repository: zod.string().optional(),
        git_branch: zod.string().optional(),
        build_pack: zod
          .enum(["nixpacks", "railpack", "static", "dockerfile", "dockercompose"])
          .optional(),
        ports_exposes: zod.string().optional(),
        github_app_uuid: zod.string().optional(),
        private_key_uuid: zod.string().optional(),
        dockerfile: zod.string().optional(),
        docker_registry_image_name: zod.string().optional(),
        docker_registry_image_tag: zod.string().optional(),
        domains: zod.string().optional(),
        instant_deploy: zod.boolean().optional(),
        extra: zod
          .record(zod.string(), zod.unknown())
          .optional()
          .describe(
            "Additional Coolify application fields for the chosen type"
          ),
      },
    },
    async ({ type, extra, ...fields }) => {
      requireWrite();
      const payload: Record<string, unknown> = { ...fields, ...(extra ?? {}) };
      requireEnvironmentRef(payload, `createApplication(${type})`);
      const data = await createApplicationByType(type, payload);
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
      description:
        "Update an application's configuration by UUID. Common fields are exposed; any other Coolify application field (install/build/start commands, health checks, resource limits, static flags, ...) can go in `extra` and is validated against the OpenAPI schema.",
      inputSchema: {
        uuid: zod.string(),
        name: zod.string().optional(),
        description: zod.string().optional(),
        domains: zod.string().optional(),
        git_repository: zod.string().optional(),
        git_branch: zod.string().optional(),
        build_pack: zod
          .enum(["nixpacks", "railpack", "static", "dockerfile", "dockercompose"])
          .optional(),
        ports_exposes: zod.string().optional(),
        docker_registry_image_name: zod.string().optional(),
        docker_registry_image_tag: zod.string().optional(),
        instant_deploy: zod.boolean().optional(),
        extra: zod
          .record(zod.string(), zod.unknown())
          .optional()
          .describe("Additional Coolify application fields"),
      },
    },
    async ({ uuid, extra, ...fields }) => {
      requireWrite();
      const body = parseBody(
        z.zUpdateApplicationByUuidData.shape.body,
        { ...fields, ...(extra ?? {}) },
        "updateApplication"
      );
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
      await confirmDestructive(
        server,
        `Delete application ${uuid}`,
        "Volumes, configurations, and connected networks are deleted too unless the delete_* flags were passed as false. Not recoverable."
      );
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
      description:
        "Create a one-click service (database, cache, etc.) or a Docker Compose deployment (pass docker_compose_raw with the YAML content). Requires project_uuid, server_uuid, and environment_name (or environment_uuid). Since Coolify v4.1, Docker Compose deployments are services, not applications.",
      inputSchema: z.zCreateServiceData.shape.body.shape,
    },
    async (body) => {
      requireWrite();
      requireEnvironmentRef(body, "createService");
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
