import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { COOLIFY_ALLOW_WRITE } from "../config.js";
import * as sdk from "../generated/sdk.gen.js";
import * as z from "../generated/zod.gen.js";

async function unwrap<T>(
  promise: Promise<{ data?: T; error?: unknown }>
): Promise<T> {
  const result = await promise;
  if (result.error) {
    const msg =
      typeof result.error === "object" &&
      result.error !== null &&
      "message" in result.error
        ? String((result.error as { message: unknown }).message)
        : "API request failed";
    throw new Error(msg);
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

function requireWrite() {
  if (!COOLIFY_ALLOW_WRITE) {
    throw new Error(
      "Write operations are disabled (COOLIFY_ALLOW_WRITE=false)."
    );
  }
}

export function registerCoolifyTools(server: McpServer) {
  server.registerTool(
    "listResources",
    {
      title: "List resources",
      description: "List all Coolify resources.",
      inputSchema: {},
    },
    async () => list("Resources fetched.", await unwrap(sdk.listResources()))
  );

  server.registerTool(
    "listApplications",
    {
      title: "List applications",
      description: "List all Coolify applications.",
      inputSchema: {},
    },
    async () =>
      list("Applications fetched.", await unwrap(sdk.listApplications()))
  );

  server.registerTool(
    "listDatabases",
    {
      title: "List databases",
      description: "List all Coolify databases.",
      inputSchema: {},
    },
    async () => list("Databases fetched.", await unwrap(sdk.listDatabases()))
  );

  server.registerTool(
    "listDeployments",
    {
      title: "List deployments",
      description: "List currently running deployments.",
      inputSchema: {},
    },
    async () =>
      list("Running deployments fetched.", await unwrap(sdk.listDeployments()))
  );

  server.registerTool(
    "listEnvs",
    {
      title: "List env vars",
      description: "List environment variables for an application.",
      inputSchema: z.zListEnvsByApplicationUuidData.shape.path.shape,
    },
    async ({ uuid }) =>
      list(
        `Env vars for ${uuid} fetched.`,
        await unwrap(sdk.listEnvsByApplicationUuid({ path: { uuid } }))
      )
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
    async ({ uuid, ...query }) =>
      list(
        `Deployments for ${uuid} fetched.`,
        await unwrap(sdk.listDeploymentsByAppUuid({ path: { uuid }, query }))
      )
  );

  server.registerTool(
    "getApplication",
    {
      title: "Get application",
      description: "Get application details by UUID.",
      inputSchema: z.zGetApplicationByUuidData.shape.path.shape,
    },
    async ({ uuid }) =>
      ok(
        `Application ${uuid} fetched.`,
        await unwrap(sdk.getApplicationByUuid({ path: { uuid } }))
      )
  );

  server.registerTool(
    "getDatabase",
    {
      title: "Get database",
      description: "Get database details by UUID.",
      inputSchema: z.zGetDatabaseByUuidData.shape.path.shape,
    },
    async ({ uuid }) =>
      ok(
        `Database ${uuid} fetched.`,
        await unwrap(sdk.getDatabaseByUuid({ path: { uuid } }))
      )
  );

  server.registerTool(
    "getDeployment",
    {
      title: "Get deployment",
      description: "Get deployment status and logs by UUID.",
      inputSchema: z.zGetDeploymentByUuidData.shape.path.shape,
    },
    async ({ uuid }) =>
      ok(
        `Deployment ${uuid} fetched.`,
        await unwrap(sdk.getDeploymentByUuid({ path: { uuid } }))
      )
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
    async ({ uuid, ...query }) =>
      ok(
        "Logs fetched.",
        await unwrap(sdk.getApplicationLogsByUuid({ path: { uuid }, query }))
      )
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
        sdk.createEnvByApplicationUuid({ path: { uuid }, body })
      );
      return ok(`Env var ${body.key} created.`, data);
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
        sdk.updateEnvByApplicationUuid({ path: { uuid }, body })
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
        await unwrap(sdk.deployByTagOrUuid({ query }))
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
        await unwrap(sdk.cancelDeploymentByUuid({ path: { uuid } }))
      );
    }
  );
}
