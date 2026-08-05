import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z as zod } from "zod";
import * as sdk from "../generated/sdk.gen.js";
import * as z from "../generated/zod.gen.js";
import { list, ok, parseBody, requireWrite, unwrap } from "./common.js";

export function registerResourceTools(server: McpServer) {
  server.registerTool(
    "storages",
    {
      title: "Manage persistent/file storages",
      description:
        "Manage persistent volumes and file mounts for an application, database, or service. Actions: list, create, update, delete. create needs storage type ('persistent' or 'file') and mount_path; update targets storage_uuid; delete needs storage_uuid.",
      inputSchema: {
        resource: zod.enum(["application", "database", "service"]),
        uuid: zod.string().describe("Resource UUID"),
        action: zod.enum(["list", "create", "update", "delete"]),
        storage_uuid: zod.string().optional().describe("Required for update and delete"),
        resource_uuid: zod
          .string()
          .optional()
          .describe(
            "For service storages: UUID of the sub-resource (container) inside the service to mount on. Required by the API when resource is 'service'."
          ),
        type: zod.enum(["persistent", "file"]).optional(),
        name: zod.string().optional(),
        mount_path: zod.string().optional(),
        host_path: zod.string().optional(),
        content: zod.string().optional().describe("File content for type 'file'"),
        is_directory: zod.boolean().optional(),
      },
    },
    async ({ resource, uuid, action, storage_uuid, ...fields }) => {
      const context = `storages(${resource}:${action})`;
      switch (action) {
        case "list": {
          const calls = {
            application: sdk.listStoragesByApplicationUuid,
            database: sdk.listStoragesByDatabaseUuid,
            service: sdk.listStoragesByServiceUuid,
          } as const;
          const data = await unwrap(calls[resource]({ path: { uuid } }), context);
          return list(`Storages for ${resource} ${uuid} fetched.`, data);
        }
        case "create": {
          requireWrite();
          const schemas = {
            application: z.zCreateStorageByApplicationUuidData,
            database: z.zCreateStorageByDatabaseUuidData,
            service: z.zCreateStorageByServiceUuidData,
          } as const;
          const calls = {
            application: sdk.createStorageByApplicationUuid,
            database: sdk.createStorageByDatabaseUuid,
            service: sdk.createStorageByServiceUuid,
          } as const;
          const body = parseBody(schemas[resource].shape.body, fields, context);
          const data = await unwrap(
            calls[resource]({ path: { uuid }, body: body as never }),
            context
          );
          return ok(`Storage created on ${resource} ${uuid}.`, data);
        }
        case "update": {
          requireWrite();
          if (!storage_uuid) {
            throw new Error(`${context}: storage_uuid is required`);
          }
          const schemas = {
            application: z.zUpdateStorageByApplicationUuidData,
            database: z.zUpdateStorageByDatabaseUuidData,
            service: z.zUpdateStorageByServiceUuidData,
          } as const;
          const calls = {
            application: sdk.updateStorageByApplicationUuid,
            database: sdk.updateStorageByDatabaseUuid,
            service: sdk.updateStorageByServiceUuid,
          } as const;
          const body = parseBody(
            schemas[resource].shape.body,
            { uuid: storage_uuid, ...fields },
            context
          );
          const data = await unwrap(
            calls[resource]({ path: { uuid }, body: body as never }),
            context
          );
          return ok(`Storage ${storage_uuid} updated on ${resource} ${uuid}.`, data);
        }
        case "delete": {
          requireWrite();
          if (!storage_uuid) {
            throw new Error(`${context}: storage_uuid is required`);
          }
          const calls = {
            application: sdk.deleteStorageByApplicationUuid,
            database: sdk.deleteStorageByDatabaseUuid,
            service: sdk.deleteStorageByServiceUuid,
          } as const;
          const data = await unwrap(
            calls[resource]({ path: { uuid, storage_uuid } }),
            context
          );
          return ok(`Storage ${storage_uuid} deleted from ${resource} ${uuid}.`, data);
        }
      }
    }
  );

  server.registerTool(
    "scheduledTasks",
    {
      title: "Manage scheduled tasks",
      description:
        "Manage scheduled tasks (cron jobs) for an application or service. Actions: list, create (name, command, frequency), update, delete, list_executions (all but list/create need task_uuid).",
      inputSchema: {
        resource: zod.enum(["application", "service"]),
        uuid: zod.string().describe("Resource UUID"),
        action: zod.enum(["list", "create", "update", "delete", "list_executions"]),
        task_uuid: zod.string().optional(),
        name: zod.string().optional(),
        command: zod.string().optional(),
        frequency: zod.string().optional().describe("Cron expression"),
        container: zod.string().optional(),
        timeout: zod.number().int().optional(),
        enabled: zod.boolean().optional(),
      },
    },
    async ({ resource, uuid, action, task_uuid, ...fields }) => {
      const context = `scheduledTasks(${resource}:${action})`;
      const needTask = (): string => {
        if (!task_uuid) throw new Error(`${context}: task_uuid is required`);
        return task_uuid;
      };
      switch (action) {
        case "list": {
          const calls = {
            application: sdk.listScheduledTasksByApplicationUuid,
            service: sdk.listScheduledTasksByServiceUuid,
          } as const;
          const data = await unwrap(calls[resource]({ path: { uuid } }), context);
          return list(`Scheduled tasks for ${resource} ${uuid} fetched.`, data);
        }
        case "create": {
          requireWrite();
          const schemas = {
            application: z.zCreateScheduledTaskByApplicationUuidData,
            service: z.zCreateScheduledTaskByServiceUuidData,
          } as const;
          const calls = {
            application: sdk.createScheduledTaskByApplicationUuid,
            service: sdk.createScheduledTaskByServiceUuid,
          } as const;
          const body = parseBody(schemas[resource].shape.body, fields, context);
          const data = await unwrap(
            calls[resource]({ path: { uuid }, body: body as never }),
            context
          );
          return ok(`Scheduled task created on ${resource} ${uuid}.`, data);
        }
        case "update": {
          requireWrite();
          const taskUuid = needTask();
          const schemas = {
            application: z.zUpdateScheduledTaskByApplicationUuidData,
            service: z.zUpdateScheduledTaskByServiceUuidData,
          } as const;
          const calls = {
            application: sdk.updateScheduledTaskByApplicationUuid,
            service: sdk.updateScheduledTaskByServiceUuid,
          } as const;
          const body = parseBody(schemas[resource].shape.body, fields, context);
          const data = await unwrap(
            calls[resource]({
              path: { uuid, task_uuid: taskUuid },
              body: body as never,
            }),
            context
          );
          return ok(`Scheduled task ${taskUuid} updated.`, data);
        }
        case "delete": {
          requireWrite();
          const taskUuid = needTask();
          const calls = {
            application: sdk.deleteScheduledTaskByApplicationUuid,
            service: sdk.deleteScheduledTaskByServiceUuid,
          } as const;
          const data = await unwrap(
            calls[resource]({ path: { uuid, task_uuid: taskUuid } }),
            context
          );
          return ok(`Scheduled task ${taskUuid} deleted.`, data);
        }
        case "list_executions": {
          const taskUuid = needTask();
          const calls = {
            application: sdk.listScheduledTaskExecutionsByApplicationUuid,
            service: sdk.listScheduledTaskExecutionsByServiceUuid,
          } as const;
          const data = await unwrap(
            calls[resource]({ path: { uuid, task_uuid: taskUuid } }),
            context
          );
          return list(`Executions for task ${taskUuid} fetched.`, data);
        }
      }
    }
  );

  server.registerTool(
    "teams",
    {
      title: "Teams",
      description:
        "Read Coolify teams. Actions: list, current, current_members, get (needs id), members (needs id).",
      inputSchema: {
        action: zod.enum(["list", "current", "current_members", "get", "members"]),
        id: zod.number().int().optional().describe("Team id for get/members"),
      },
    },
    async ({ action, id }) => {
      const needId = (): number => {
        if (id === undefined) throw new Error(`teams(${action}): id is required`);
        return id;
      };
      switch (action) {
        case "list":
          return list("Teams fetched.", await unwrap(sdk.listTeams(), "teams(list)"));
        case "current":
          return ok(
            "Current team fetched.",
            await unwrap(sdk.getCurrentTeam(), "teams(current)")
          );
        case "current_members":
          return list(
            "Current team members fetched.",
            await unwrap(sdk.getCurrentTeamMembers(), "teams(current_members)")
          );
        case "get":
          return ok(
            `Team ${id} fetched.`,
            await unwrap(sdk.getTeamById({ path: { id: needId() } }), "teams(get)")
          );
        case "members":
          return list(
            `Members of team ${id} fetched.`,
            await unwrap(
              sdk.getMembersByTeamId({ path: { id: needId() } }),
              "teams(members)"
            )
          );
      }
    }
  );

  server.registerTool(
    "deletePreview",
    {
      title: "Delete preview deployment",
      description:
        "Delete a preview deployment of an application by pull request id.",
      inputSchema: {
        uuid: zod.string().describe("Application UUID"),
        pull_request_id: zod.number().int(),
      },
    },
    async ({ uuid, pull_request_id }) => {
      requireWrite();
      const data = await unwrap(
        sdk.deletePreviewDeploymentByPullRequestId({
          path: { uuid, pull_request_id },
        }),
        "deletePreview"
      );
      return ok(`Preview deployment for PR ${pull_request_id} deleted.`, data);
    }
  );

}
