import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z as zod } from "zod";
import * as sdk from "../generated/sdk.gen.js";
import { confirmDestructive, ok, requireWrite, unwrap } from "./common.js";
import {
  isRecord,
  normalizeItems,
  pickFields,
  redactSecrets,
  summarizeApplication,
  summarizeDatabase,
  summarizeResource,
} from "./helpers.js";

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isRunning(status: string): boolean {
  return status.toLowerCase().startsWith("running");
}

interface AppRef {
  uuid: string;
  name: string;
  status: string;
}

function toAppRefs(items: unknown[]): AppRef[] {
  return items
    .filter(isRecord)
    .map((app) => ({
      uuid: asString(app.uuid),
      name: asString(app.name) || asString(app.uuid),
      status: asString(app.status),
    }))
    .filter((app) => app.uuid !== "");
}

// Collect the applications of a project, optionally restricted to one
// environment (by name or uuid).
async function collectProjectApplications(
  projectUuid: string,
  environment?: string
): Promise<AppRef[]> {
  const environments = await unwrap(
    sdk.getEnvironments({ path: { uuid: projectUuid } }),
    "collectProjectApplications"
  );
  const envList = (Array.isArray(environments) ? environments : [])
    .filter(isRecord)
    .filter((env) => {
      if (!environment) return true;
      const target = environment.trim().toLowerCase();
      return (
        asString(env.name).toLowerCase() === target ||
        asString(env.uuid).toLowerCase() === target
      );
    });

  const apps: AppRef[] = [];
  for (const env of envList) {
    const ref = asString(env.uuid) || asString(env.name);
    if (!ref) continue;
    // The generated Environment type omits `applications`, but the API
    // returns it — treat the payload as unknown and guard at runtime.
    const detail: unknown = await unwrap(
      sdk.getEnvironmentByNameOrUuid({
        path: { uuid: projectUuid, environment_name_or_uuid: ref },
      }),
      "collectProjectApplications"
    );
    if (isRecord(detail) && Array.isArray(detail.applications)) {
      apps.push(...toAppRefs(detail.applications));
    }
  }
  return apps;
}

function describeApps(apps: AppRef[], max = 8): string {
  const names = apps.map((app) => app.name);
  const shown = names.slice(0, max).join(", ");
  return names.length > max
    ? `${shown} and ${names.length - max} more`
    : shown;
}

export function registerBatchTools(server: McpServer) {
  server.registerTool(
    "getInfrastructureOverview",
    {
      title: "Infrastructure overview",
      description:
        "One-call summary of the whole Coolify estate: servers, projects, applications (with status breakdown), databases, services, and currently running deployments.",
      inputSchema: {},
    },
    async () => {
      const [servers, projects, apps, databases, services, deployments] =
        await Promise.all([
          unwrap(sdk.listServers(), "overview(servers)"),
          unwrap(sdk.listProjects(), "overview(projects)"),
          unwrap(sdk.listApplications(), "overview(applications)"),
          unwrap(sdk.listDatabases(), "overview(databases)"),
          unwrap(sdk.listServices(), "overview(services)"),
          unwrap(sdk.listDeployments(), "overview(deployments)"),
        ]);

      const appItems = (normalizeItems(apps) ?? []).map(summarizeApplication);
      const statusBreakdown: Record<string, number> = {};
      for (const app of appItems) {
        if (!isRecord(app)) continue;
        const status = asString(app.status).split(":")[0] || "unknown";
        statusBreakdown[status] = (statusBreakdown[status] ?? 0) + 1;
      }

      const overview = {
        servers: (Array.isArray(servers) ? servers : [])
          .filter(isRecord)
          .map((s) => pickFields(s, ["uuid", "name", "ip"])),
        projects: (Array.isArray(projects) ? projects : [])
          .filter(isRecord)
          .map((p) => pickFields(p, ["uuid", "name"])),
        applications: appItems,
        application_status_breakdown: statusBreakdown,
        databases: (normalizeItems(databases) ?? []).map(summarizeDatabase),
        services: (normalizeItems(services) ?? [])
          .filter(isRecord)
          .map((s) => pickFields(s, ["uuid", "name", "status"])),
        running_deployments: (normalizeItems(deployments) ?? []).map(
          summarizeResource
        ),
      };
      return ok(
        `Infrastructure: ${overview.servers.length} servers, ${overview.projects.length} projects, ${overview.applications.length} applications, ${overview.databases.length} databases, ${overview.services.length} services, ${overview.running_deployments.length} running deployments.`,
        redactSecrets(overview)
      );
    }
  );

  server.registerTool(
    "getHealth",
    {
      title: "Coolify health check",
      description: "Check that the Coolify API is up (GET /health).",
      inputSchema: {},
    },
    async () => {
      const data = await unwrap(sdk.healthcheck(), "getHealth");
      return ok("Coolify API is healthy.", { health: data });
    }
  );

  server.registerTool(
    "restartProjectApps",
    {
      title: "Restart all project applications",
      description:
        "Restart every application in a project (optionally a single environment). Asks for confirmation on clients that support elicitation.",
      inputSchema: {
        project_uuid: zod.string(),
        environment: zod
          .string()
          .optional()
          .describe("Environment name or UUID to restrict to"),
      },
    },
    async ({ project_uuid, environment }) => {
      requireWrite();
      const apps = await collectProjectApplications(project_uuid, environment);
      if (apps.length === 0) {
        return ok("No applications found in the project — nothing to restart.", {
          restarted: [],
        });
      }
      await confirmDestructive(
        server,
        `Restart ${apps.length} application(s)`,
        `Project ${project_uuid}${environment ? `, environment ${environment}` : ""}: ${describeApps(apps)}. Each app is briefly unavailable while restarting.`
      );
      const results: Record<string, string>[] = [];
      for (const app of apps) {
        try {
          await unwrap(
            sdk.restartApplicationByUuid({ path: { uuid: app.uuid } }),
            "restartProjectApps"
          );
          results.push({ uuid: app.uuid, name: app.name, result: "restarting" });
        } catch (error) {
          results.push({
            uuid: app.uuid,
            name: app.name,
            result: `error: ${error instanceof Error ? error.message : String(error)}`,
          });
        }
      }
      const failed = results.filter((r) => r.result.startsWith("error")).length;
      return ok(
        failed === 0
          ? `Restart requested for ${results.length} application(s).`
          : `Restart requested; ${failed} of ${results.length} failed.`,
        { results }
      );
    }
  );

  server.registerTool(
    "redeployProject",
    {
      title: "Redeploy all project applications",
      description:
        "Trigger a deployment for every application in a project (optionally a single environment). Asks for confirmation on clients that support elicitation.",
      inputSchema: {
        project_uuid: zod.string(),
        environment: zod.string().optional(),
        force: zod.boolean().optional().describe("Force rebuild without cache"),
      },
    },
    async ({ project_uuid, environment, force }) => {
      requireWrite();
      const apps = await collectProjectApplications(project_uuid, environment);
      if (apps.length === 0) {
        return ok("No applications found in the project — nothing to deploy.", {
          deployments: [],
        });
      }
      await confirmDestructive(
        server,
        `Redeploy ${apps.length} application(s)`,
        `Project ${project_uuid}${environment ? `, environment ${environment}` : ""}: ${describeApps(apps)}.`
      );
      const data = await unwrap(
        sdk.deployByTagOrUuid({
          query: { uuid: apps.map((app) => app.uuid).join(","), force },
        }),
        "redeployProject"
      );
      return ok(`Deployment triggered for ${apps.length} application(s).`, data);
    }
  );

  server.registerTool(
    "stopAllApplications",
    {
      title: "Emergency stop applications",
      description:
        "Stop every running application, optionally restricted to one project. Asks for confirmation on clients that support elicitation, stating the blast radius.",
      inputSchema: {
        project_uuid: zod
          .string()
          .optional()
          .describe("Restrict to a single project"),
      },
    },
    async ({ project_uuid }) => {
      requireWrite();
      let candidates: AppRef[];
      if (project_uuid) {
        candidates = await collectProjectApplications(project_uuid);
      } else {
        const apps = await unwrap(sdk.listApplications(), "stopAllApplications");
        candidates = toAppRefs(normalizeItems(apps) ?? []);
      }
      const running = candidates.filter((app) => isRunning(app.status));
      if (running.length === 0) {
        return ok("No running applications — nothing to stop.", { stopped: [] });
      }
      await confirmDestructive(
        server,
        `EMERGENCY STOP: take down ${running.length} running application(s)`,
        `${project_uuid ? `Project ${project_uuid}: ` : "Entire estate: "}${describeApps(running)}.`
      );
      const results: Record<string, string>[] = [];
      for (const app of running) {
        try {
          await unwrap(
            sdk.stopApplicationByUuid({ path: { uuid: app.uuid } }),
            "stopAllApplications"
          );
          results.push({ uuid: app.uuid, name: app.name, result: "stopped" });
        } catch (error) {
          results.push({
            uuid: app.uuid,
            name: app.name,
            result: `error: ${error instanceof Error ? error.message : String(error)}`,
          });
        }
      }
      const failed = results.filter((r) => r.result.startsWith("error")).length;
      return ok(
        failed === 0
          ? `${results.length} application(s) stopped.`
          : `${results.length - failed} stopped, ${failed} failed.`,
        { results }
      );
    }
  );
}

export { collectProjectApplications, describeApps, isRunning, toAppRefs };
