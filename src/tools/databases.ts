import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z as zod } from "zod";
import * as sdk from "../generated/sdk.gen.js";
import * as z from "../generated/zod.gen.js";
import { list, listWithMeta, ok, parseBody, requireWrite, unwrap } from "./common.js";
import { isRecord, maskEnvVar, redactSecrets } from "./helpers.js";

const DATABASE_ENGINES = [
  "postgresql",
  "mysql",
  "mariadb",
  "mongodb",
  "redis",
  "keydb",
  "dragonfly",
  "clickhouse",
] as const;
type DatabaseEngine = (typeof DATABASE_ENGINES)[number];

async function createDatabaseByEngine(
  engine: DatabaseEngine,
  payload: Record<string, unknown>
) {
  const context = `createDatabase(${engine})`;
  switch (engine) {
    case "postgresql":
      return unwrap(
        sdk.createDatabasePostgresql({
          body: parseBody(
            z.zCreateDatabasePostgresqlData.shape.body,
            payload,
            context
          ),
        }),
        context
      );
    case "mysql":
      return unwrap(
        sdk.createDatabaseMysql({
          body: parseBody(z.zCreateDatabaseMysqlData.shape.body, payload, context),
        }),
        context
      );
    case "mariadb":
      return unwrap(
        sdk.createDatabaseMariadb({
          body: parseBody(
            z.zCreateDatabaseMariadbData.shape.body,
            payload,
            context
          ),
        }),
        context
      );
    case "mongodb":
      return unwrap(
        sdk.createDatabaseMongodb({
          body: parseBody(
            z.zCreateDatabaseMongodbData.shape.body,
            payload,
            context
          ),
        }),
        context
      );
    case "redis":
      return unwrap(
        sdk.createDatabaseRedis({
          body: parseBody(z.zCreateDatabaseRedisData.shape.body, payload, context),
        }),
        context
      );
    case "keydb":
      return unwrap(
        sdk.createDatabaseKeydb({
          body: parseBody(z.zCreateDatabaseKeydbData.shape.body, payload, context),
        }),
        context
      );
    case "dragonfly":
      return unwrap(
        sdk.createDatabaseDragonfly({
          body: parseBody(
            z.zCreateDatabaseDragonflyData.shape.body,
            payload,
            context
          ),
        }),
        context
      );
    case "clickhouse":
      return unwrap(
        sdk.createDatabaseClickhouse({
          body: parseBody(
            z.zCreateDatabaseClickhouseData.shape.body,
            payload,
            context
          ),
        }),
        context
      );
  }
}

export function registerDatabaseTools(server: McpServer) {
  server.registerTool(
    "createDatabase",
    {
      title: "Create database",
      description:
        "Create a database. `type` selects the engine: postgresql, mysql, mariadb, mongodb, redis, keydb, dragonfly, or clickhouse. Requires project_uuid, server_uuid, environment_name, and environment_uuid. Engine-specific fields (versions, credentials, memory limits, ...) can be passed in `extra` and are validated per engine.",
      inputSchema: {
        type: zod.enum(DATABASE_ENGINES).describe("Database engine"),
        project_uuid: zod.string(),
        server_uuid: zod.string(),
        environment_name: zod.string(),
        environment_uuid: zod.string(),
        name: zod.string().optional(),
        description: zod.string().optional(),
        image: zod.string().optional(),
        is_public: zod.boolean().optional(),
        public_port: zod.number().int().optional(),
        instant_deploy: zod.boolean().optional(),
        extra: zod
          .record(zod.string(), zod.unknown())
          .optional()
          .describe("Additional engine-specific Coolify database fields"),
      },
    },
    async ({ type, extra, ...fields }) => {
      requireWrite();
      const payload: Record<string, unknown> = { ...fields, ...(extra ?? {}) };
      const data = await createDatabaseByEngine(type, payload);
      const uuid = isRecord(data) ? data.uuid : undefined;
      return ok(
        uuid ? `Database created with UUID: ${uuid}` : "Database created.",
        redactSecrets(data)
      );
    }
  );

  server.registerTool(
    "updateDatabase",
    {
      title: "Update database",
      description:
        "Update a database's configuration by UUID. Common fields are exposed; any other Coolify database field can go in `extra`.",
      inputSchema: {
        uuid: zod.string(),
        name: zod.string().optional(),
        description: zod.string().optional(),
        image: zod.string().optional(),
        is_public: zod.boolean().optional(),
        public_port: zod.number().int().optional(),
        extra: zod
          .record(zod.string(), zod.unknown())
          .optional()
          .describe("Additional Coolify database fields"),
      },
    },
    async ({ uuid, extra, ...fields }) => {
      requireWrite();
      const body = parseBody(
        z.zUpdateDatabaseByUuidData.shape.body,
        { ...fields, ...(extra ?? {}) },
        "updateDatabase"
      );
      const data = await unwrap(
        sdk.updateDatabaseByUuid({ path: { uuid }, body }),
        "updateDatabase"
      );
      return ok(`Database ${uuid} updated.`, redactSecrets(data));
    }
  );

  server.registerTool(
    "deleteDatabase",
    {
      title: "Delete database",
      description:
        "Delete a database by UUID. By default Coolify also deletes configurations, volumes, and connected networks and runs docker cleanup; pass the flags as false to keep them.",
      inputSchema: {
        ...z.zDeleteDatabaseByUuidData.shape.path.shape,
        ...z.zDeleteDatabaseByUuidData.shape.query.unwrap().shape,
      },
    },
    async ({ uuid, ...query }) => {
      requireWrite();
      const data = await unwrap(
        sdk.deleteDatabaseByUuid({ path: { uuid }, query }),
        "deleteDatabase"
      );
      return ok(`Database ${uuid} deleted.`, data);
    }
  );

  server.registerTool(
    "controlDatabase",
    {
      title: "Start/stop/restart database",
      description: "Start, stop, or restart a database by UUID.",
      inputSchema: {
        uuid: zod.string(),
        action: zod.enum(["start", "stop", "restart"]),
      },
    },
    async ({ uuid, action }) => {
      requireWrite();
      const calls = {
        start: sdk.startDatabaseByUuid,
        stop: sdk.stopDatabaseByUuid,
        restart: sdk.restartDatabaseByUuid,
      } as const;
      const data = await unwrap(
        calls[action]({ path: { uuid } }),
        `controlDatabase(${action})`
      );
      return ok(`Database ${uuid} ${action} requested.`, data);
    }
  );

  server.registerTool(
    "databaseBackups",
    {
      title: "Manage database backups",
      description:
        "Manage scheduled backups for a database. Actions: list, create, update, delete (backup schedules), list_executions, delete_execution. create/update take frequency (cron expression) plus optional fields (enabled, save_s3, s3_storage_uuid, databases_to_backup, dump_all, retention settings via extra).",
      inputSchema: {
        uuid: zod.string().describe("Database UUID"),
        action: zod.enum([
          "list",
          "create",
          "update",
          "delete",
          "list_executions",
          "delete_execution",
        ]),
        scheduled_backup_uuid: zod
          .string()
          .optional()
          .describe("Required for update, delete, list_executions, delete_execution"),
        execution_uuid: zod
          .string()
          .optional()
          .describe("Required for delete_execution"),
        frequency: zod.string().optional().describe("Cron expression, e.g. '0 0 * * *'"),
        enabled: zod.boolean().optional(),
        save_s3: zod.boolean().optional(),
        s3_storage_uuid: zod.string().optional(),
        databases_to_backup: zod.string().optional(),
        dump_all: zod.boolean().optional(),
        extra: zod
          .record(zod.string(), zod.unknown())
          .optional()
          .describe("Additional backup fields (retention settings, backup_now, ...)"),
      },
    },
    async ({
      uuid,
      action,
      scheduled_backup_uuid,
      execution_uuid,
      extra,
      ...fields
    }) => {
      const requireParam = (value: string | undefined, name: string): string => {
        if (!value) {
          throw new Error(`databaseBackups(${action}): ${name} is required`);
        }
        return value;
      };
      switch (action) {
        case "list": {
          const data = await unwrap(
            sdk.getDatabaseBackupsByUuid({ path: { uuid } }),
            "databaseBackups(list)"
          );
          return list(`Backup schedules for database ${uuid} fetched.`, data);
        }
        case "create": {
          requireWrite();
          const body = parseBody(
            z.zCreateDatabaseBackupData.shape.body,
            { ...fields, ...(extra ?? {}) },
            "databaseBackups(create)"
          );
          const data = await unwrap(
            sdk.createDatabaseBackup({ path: { uuid }, body }),
            "databaseBackups(create)"
          );
          return ok(`Backup schedule created for database ${uuid}.`, data);
        }
        case "update": {
          requireWrite();
          const backupUuid = requireParam(
            scheduled_backup_uuid,
            "scheduled_backup_uuid"
          );
          const body = parseBody(
            z.zUpdateDatabaseBackupData.shape.body,
            { ...fields, ...(extra ?? {}) },
            "databaseBackups(update)"
          );
          const data = await unwrap(
            sdk.updateDatabaseBackup({
              path: { uuid, scheduled_backup_uuid: backupUuid },
              body,
            }),
            "databaseBackups(update)"
          );
          return ok(`Backup schedule ${backupUuid} updated.`, data);
        }
        case "delete": {
          requireWrite();
          const backupUuid = requireParam(
            scheduled_backup_uuid,
            "scheduled_backup_uuid"
          );
          const data = await unwrap(
            sdk.deleteBackupConfigurationByUuid({
              path: { uuid, scheduled_backup_uuid: backupUuid },
            }),
            "databaseBackups(delete)"
          );
          return ok(`Backup schedule ${backupUuid} deleted.`, data);
        }
        case "list_executions": {
          const backupUuid = requireParam(
            scheduled_backup_uuid,
            "scheduled_backup_uuid"
          );
          const data = await unwrap(
            sdk.listBackupExecutions({
              path: { uuid, scheduled_backup_uuid: backupUuid },
            }),
            "databaseBackups(list_executions)"
          );
          return list(`Executions for backup ${backupUuid} fetched.`, data);
        }
        case "delete_execution": {
          requireWrite();
          const backupUuid = requireParam(
            scheduled_backup_uuid,
            "scheduled_backup_uuid"
          );
          const executionUuid = requireParam(execution_uuid, "execution_uuid");
          const data = await unwrap(
            sdk.deleteBackupExecutionByUuid({
              path: {
                uuid,
                scheduled_backup_uuid: backupUuid,
                execution_uuid: executionUuid,
              },
            }),
            "databaseBackups(delete_execution)"
          );
          return ok(`Backup execution ${executionUuid} deleted.`, data);
        }
      }
    }
  );

  server.registerTool(
    "databaseEnvs",
    {
      title: "Manage database env vars",
      description:
        "Manage environment variables for a database. Actions: list (secrets masked unless showSecrets), create, update, bulk_update (pass envs array), delete (needs env_uuid).",
      inputSchema: {
        uuid: zod.string().describe("Database UUID"),
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
            sdk.listEnvsByDatabaseUuid({ path: { uuid } }),
            "databaseEnvs(list)"
          );
          if (showSecrets) {
            return listWithMeta(`Env vars for database ${uuid} fetched.`, data, {
              showSecrets: true,
            });
          }
          const masked = Array.isArray(data)
            ? data.map((env) => maskEnvVar(env))
            : data;
          return listWithMeta(`Env vars for database ${uuid} fetched.`, masked, {
            secretsMasked: true,
          });
        }
        case "create": {
          requireWrite();
          const body = parseBody(
            z.zCreateEnvByDatabaseUuidData.shape.body,
            fields,
            "databaseEnvs(create)"
          );
          const data = await unwrap(
            sdk.createEnvByDatabaseUuid({ path: { uuid }, body }),
            "databaseEnvs(create)"
          );
          return ok(`Env var ${fields.key} created on database ${uuid}.`, data);
        }
        case "update": {
          requireWrite();
          const body = parseBody(
            z.zUpdateEnvByDatabaseUuidData.shape.body,
            fields,
            "databaseEnvs(update)"
          );
          const data = await unwrap(
            sdk.updateEnvByDatabaseUuid({ path: { uuid }, body }),
            "databaseEnvs(update)"
          );
          return ok(`Env var ${fields.key} updated on database ${uuid}.`, data);
        }
        case "bulk_update": {
          requireWrite();
          if (!envs || envs.length === 0) {
            throw new Error("databaseEnvs(bulk_update): envs array is required");
          }
          const body = parseBody(
            z.zUpdateEnvsByDatabaseUuidData.shape.body,
            { data: envs },
            "databaseEnvs(bulk_update)"
          );
          const data = await unwrap(
            sdk.updateEnvsByDatabaseUuid({ path: { uuid }, body }),
            "databaseEnvs(bulk_update)"
          );
          return ok(`${envs.length} env vars applied to database ${uuid}.`, data);
        }
        case "delete": {
          requireWrite();
          if (!env_uuid) {
            throw new Error("databaseEnvs(delete): env_uuid is required");
          }
          const data = await unwrap(
            sdk.deleteEnvByDatabaseUuid({ path: { uuid, env_uuid } }),
            "databaseEnvs(delete)"
          );
          return ok(`Env var ${env_uuid} deleted from database ${uuid}.`, data);
        }
      }
    }
  );
}
