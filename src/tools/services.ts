import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z as zod } from "zod";
import * as sdk from "../generated/sdk.gen.js";
import * as z from "../generated/zod.gen.js";
import {
  confirmDestructive,
  listWithMeta,
  ok,
  parseBody,
  requireWrite,
  unwrap,
} from "./common.js";
import { maskEnvVar, redactSecrets } from "./helpers.js";

export function registerServiceTools(server: McpServer) {
  server.registerTool(
    "getService",
    {
      title: "Get service",
      description:
        "Get service details by UUID (secrets masked by default; pass showSecrets to reveal).",
      inputSchema: {
        uuid: zod.string(),
        showSecrets: zod.boolean().optional(),
      },
    },
    async ({ uuid, showSecrets }) => {
      const data = await unwrap(
        sdk.getServiceByUuid({ path: { uuid } }),
        "getService"
      );
      if (showSecrets) {
        return ok(`Service ${uuid} fetched.`, data);
      }
      return ok(
        `Service ${uuid} fetched. Secrets masked by default.`,
        redactSecrets(data)
      );
    }
  );

  server.registerTool(
    "updateService",
    {
      title: "Update service",
      description:
        "Update a service by UUID. Common fields are exposed; any other Coolify service field (docker_compose_raw, connect_to_docker_network, ...) can go in `extra`.",
      inputSchema: {
        uuid: zod.string(),
        name: zod.string().optional(),
        description: zod.string().optional(),
        instant_deploy: zod.boolean().optional(),
        extra: zod
          .record(zod.string(), zod.unknown())
          .optional()
          .describe("Additional Coolify service fields"),
      },
    },
    async ({ uuid, extra, ...fields }) => {
      requireWrite();
      const body = parseBody(
        z.zUpdateServiceByUuidData.shape.body,
        { ...fields, ...(extra ?? {}) },
        "updateService"
      );
      const data = await unwrap(
        sdk.updateServiceByUuid({ path: { uuid }, body }),
        "updateService"
      );
      return ok(`Service ${uuid} updated.`, redactSecrets(data));
    }
  );

  server.registerTool(
    "deleteService",
    {
      title: "Delete service",
      description:
        "Delete a service by UUID. By default Coolify also deletes configurations, volumes, and connected networks and runs docker cleanup; pass the flags as false to keep them.",
      inputSchema: {
        ...z.zDeleteServiceByUuidData.shape.path.shape,
        ...z.zDeleteServiceByUuidData.shape.query.unwrap().shape,
      },
    },
    async ({ uuid, ...query }) => {
      requireWrite();
      await confirmDestructive(
        server,
        `Delete service ${uuid}`,
        "All service containers and their volumes are deleted too unless the delete_* flags were passed as false. Not recoverable."
      );
      const data = await unwrap(
        sdk.deleteServiceByUuid({ path: { uuid }, query }),
        "deleteService"
      );
      return ok(`Service ${uuid} deleted.`, data);
    }
  );

  server.registerTool(
    "controlService",
    {
      title: "Start/stop/restart service",
      description: "Start, stop, or restart a service by UUID.",
      inputSchema: {
        uuid: zod.string(),
        action: zod.enum(["start", "stop", "restart"]),
      },
    },
    async ({ uuid, action }) => {
      requireWrite();
      const calls = {
        start: sdk.startServiceByUuid,
        stop: sdk.stopServiceByUuid,
        restart: sdk.restartServiceByUuid,
      } as const;
      const data = await unwrap(
        calls[action]({ path: { uuid } }),
        `controlService(${action})`
      );
      return ok(`Service ${uuid} ${action} requested.`, data);
    }
  );

  server.registerTool(
    "serviceEnvs",
    {
      title: "Manage service env vars",
      description:
        "Manage environment variables for a service. Actions: list (secrets masked unless showSecrets), create, update, bulk_update (pass envs array), delete (needs env_uuid).",
      inputSchema: {
        uuid: zod.string().describe("Service UUID"),
        action: zod.enum(["list", "create", "update", "bulk_update", "delete"]),
        key: zod.string().optional(),
        value: zod.string().optional(),
        env_uuid: zod.string().optional().describe("Required for delete"),
        is_preview: zod.boolean().optional(),
        is_literal: zod.boolean().optional(),
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
      switch (action) {
        case "list": {
          const data = await unwrap(
            sdk.listEnvsByServiceUuid({ path: { uuid } }),
            "serviceEnvs(list)"
          );
          if (showSecrets) {
            return listWithMeta(`Env vars for service ${uuid} fetched.`, data, {
              showSecrets: true,
            });
          }
          const masked = Array.isArray(data)
            ? data.map((env) => maskEnvVar(env))
            : data;
          return listWithMeta(`Env vars for service ${uuid} fetched.`, masked, {
            secretsMasked: true,
          });
        }
        case "create": {
          requireWrite();
          const body = parseBody(
            z.zCreateEnvByServiceUuidData.shape.body,
            fields,
            "serviceEnvs(create)"
          );
          const data = await unwrap(
            sdk.createEnvByServiceUuid({ path: { uuid }, body }),
            "serviceEnvs(create)"
          );
          return ok(`Env var ${fields.key} created on service ${uuid}.`, data);
        }
        case "update": {
          requireWrite();
          const body = parseBody(
            z.zUpdateEnvByServiceUuidData.shape.body,
            fields,
            "serviceEnvs(update)"
          );
          const data = await unwrap(
            sdk.updateEnvByServiceUuid({ path: { uuid }, body }),
            "serviceEnvs(update)"
          );
          return ok(`Env var ${fields.key} updated on service ${uuid}.`, data);
        }
        case "bulk_update": {
          requireWrite();
          if (!envs || envs.length === 0) {
            throw new Error("serviceEnvs(bulk_update): envs array is required");
          }
          const body = parseBody(
            z.zUpdateEnvsByServiceUuidData.shape.body,
            { data: envs },
            "serviceEnvs(bulk_update)"
          );
          const data = await unwrap(
            sdk.updateEnvsByServiceUuid({ path: { uuid }, body }),
            "serviceEnvs(bulk_update)"
          );
          return ok(`${envs.length} env vars applied to service ${uuid}.`, data);
        }
        case "delete": {
          requireWrite();
          if (!env_uuid) {
            throw new Error("serviceEnvs(delete): env_uuid is required");
          }
          const data = await unwrap(
            sdk.deleteEnvByServiceUuid({ path: { uuid, env_uuid } }),
            "serviceEnvs(delete)"
          );
          return ok(`Env var ${env_uuid} deleted from service ${uuid}.`, data);
        }
      }
    }
  );
}
