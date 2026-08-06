import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z as zod } from "zod";
import * as sdk from "../generated/sdk.gen.js";
import { ok, unwrap } from "./common.js";
import {
  extractDeploymentLogTail,
  isRecord,
  normalizeItems,
  pickFields,
  redactSecrets,
} from "./helpers.js";

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

// Match a server by uuid, name, or IP (case-insensitive, exact).
export function matchServer(
  servers: unknown[],
  identifier: string
): Record<string, unknown>[] {
  const ident = identifier.trim().toLowerCase();
  return servers.filter((srv): srv is Record<string, unknown> => {
    if (!isRecord(srv)) return false;
    return (
      asString(srv.uuid).toLowerCase() === ident ||
      asString(srv.name).toLowerCase() === ident ||
      asString(srv.ip).toLowerCase() === ident
    );
  });
}

export function buildServerHints(input: {
  total: number;
  unhealthy: { name: string; status: string }[];
}): string[] {
  const hints: string[] = [];
  if (input.total === 0) {
    hints.push("No resources on this server yet.");
  }
  if (input.unhealthy.length > 0) {
    hints.push(
      `${input.unhealthy.length} resource(s) not running (${input.unhealthy
        .slice(0, 5)
        .map((r) => `${r.name}: ${r.status}`)
        .join(", ")}) — inspect with diagnoseApp or getLogs, or start them.`
    );
  }
  if (hints.length === 0) {
    hints.push(
      "All resources report a running status. If the server itself seems unreachable, run validateServer."
    );
  }
  return hints;
}

// Match an application by uuid, name, or domain (case-insensitive; domains
// match on substring so "app.example.com" finds "https://app.example.com").
export function matchApplication(
  apps: unknown[],
  identifier: string
): Record<string, unknown>[] {
  const ident = identifier.trim().toLowerCase();
  return apps.filter((app): app is Record<string, unknown> => {
    if (!isRecord(app)) return false;
    if (asString(app.uuid).toLowerCase() === ident) return true;
    if (asString(app.name).toLowerCase() === ident) return true;
    const fqdn = asString(app.fqdn).toLowerCase();
    return fqdn !== "" && fqdn.includes(ident);
  });
}

export function buildHints(input: {
  status: string;
  latestDeploymentStatus?: string;
  hasDeployments: boolean;
}): string[] {
  const hints: string[] = [];
  const status = input.status.toLowerCase();
  if (!input.hasDeployments) {
    hints.push("No deployments found — trigger one with deploy({ uuid }).");
  }
  if (input.latestDeploymentStatus === "failed") {
    hints.push(
      "Latest deployment failed — the log tail below shows the last build output; fix and redeploy with deploy({ uuid, wait: true })."
    );
  }
  if (input.latestDeploymentStatus === "in_progress" || input.latestDeploymentStatus === "queued") {
    hints.push(
      "A deployment is currently running — follow it with getDeployment or deploy({ uuid, wait: true }) next time."
    );
  }
  // Coolify statuses combine state and health ("exited:unhealthy",
  // "running:healthy"), so check the state first and only mention health
  // when the container is actually up — otherwise both hints fire and
  // contradict each other.
  const state = status.split(":")[0];
  if (state.includes("exited") || state.includes("stopped")) {
    hints.push(
      "The application container is not running — startApplication({ uuid }) or check the runtime log tail for the crash reason."
    );
  } else if (status.includes("unhealthy") || status.includes("degraded")) {
    hints.push(
      "The application is running but unhealthy — inspect the runtime logs and health check configuration."
    );
  }
  if (hints.length === 0) {
    hints.push("No obvious problem detected from status and recent deployments.");
  }
  return hints;
}

export function registerDiagnosticsTools(server: McpServer) {
  server.registerTool(
    "diagnoseServer",
    {
      title: "Diagnose server",
      annotations: { readOnlyHint: true, openWorldHint: true },
      description:
        "Diagnose a server by UUID, name, or IP: lists the resources running on it with a status breakdown, configured domains, and suggested next actions.",
      inputSchema: {
        identifier: zod.string().describe("Server UUID, name, or IP"),
      },
    },
    async ({ identifier }) => {
      const servers = await unwrap(sdk.listServers(), "diagnoseServer");
      const matches = matchServer(
        Array.isArray(servers) ? servers : [],
        identifier
      );
      if (matches.length === 0) {
        const known = (Array.isArray(servers) ? servers : [])
          .filter(isRecord)
          .map((srv) => `${asString(srv.name)} (${asString(srv.ip)})`)
          .slice(0, 20);
        throw new Error(
          `diagnoseServer: no server matches "${identifier}". Known servers: ${known.join(", ") || "none"}`
        );
      }
      if (matches.length > 1) {
        return ok(
          `Identifier "${identifier}" matches ${matches.length} servers — pick one by uuid.`,
          {
            candidates: matches.map((srv) =>
              pickFields(srv, ["uuid", "name", "ip"])
            ),
          }
        );
      }

      const srv = matches[0];
      const uuid = asString(srv.uuid);
      const [resourcesRaw, domainsRaw] = await Promise.all([
        unwrap(
          sdk.getResourcesByServerUuid({ path: { uuid } }),
          "diagnoseServer"
        ),
        unwrap(sdk.getDomainsByServerUuid({ path: { uuid } }), "diagnoseServer"),
      ]);

      const resources = (normalizeItems(resourcesRaw) ?? [])
        .filter(isRecord)
        .map((r) => pickFields(r, ["uuid", "name", "type", "status"]));
      const statusBreakdown: Record<string, number> = {};
      const unhealthy: { name: string; status: string }[] = [];
      for (const resource of resources) {
        const status = asString(resource.status).split(":")[0] || "unknown";
        statusBreakdown[status] = (statusBreakdown[status] ?? 0) + 1;
        if (status !== "running") {
          unhealthy.push({
            name: asString(resource.name) || asString(resource.uuid),
            status: asString(resource.status),
          });
        }
      }

      const hints = buildServerHints({ total: resources.length, unhealthy });
      return ok(
        `Diagnosis for server ${asString(srv.name) || uuid}: ${resources.length} resources (${Object.entries(statusBreakdown)
          .map(([s, n]) => `${n} ${s}`)
          .join(", ") || "none"}).`,
        {
          server: redactSecrets(
            pickFields(srv, ["uuid", "name", "ip", "user", "port", "proxy_type"])
          ),
          resources,
          status_breakdown: statusBreakdown,
          domains: domainsRaw,
          hints,
        }
      );
    }
  );

  server.registerTool(
    "diagnoseApp",
    {
      title: "Diagnose application",
      annotations: { readOnlyHint: true, openWorldHint: true },
      description:
        "Diagnose an application by UUID, name, or domain. Aggregates current status, the latest deployments, a log tail from the most recent failed deployment, recent runtime logs, and suggested next actions in one call.",
      inputSchema: {
        identifier: zod
          .string()
          .describe("Application UUID, name, or domain (fqdn substring)"),
        log_lines: zod
          .number()
          .int()
          .min(10)
          .max(500)
          .optional()
          .describe("Runtime log lines to include (default 60)"),
      },
    },
    async ({ identifier, log_lines }) => {
      const appsRaw = await unwrap(sdk.listApplications(), "diagnoseApp");
      const apps = normalizeItems(appsRaw) ?? [];
      const matches = matchApplication(apps, identifier);

      if (matches.length === 0) {
        const known = apps
          .filter(isRecord)
          .map((app) => asString(app.name))
          .filter((name) => name !== "")
          .slice(0, 25);
        throw new Error(
          `diagnoseApp: no application matches "${identifier}". Known applications: ${known.join(", ") || "none"}`
        );
      }
      if (matches.length > 1) {
        return ok(
          `Identifier "${identifier}" matches ${matches.length} applications — pick one by uuid.`,
          {
            candidates: matches.map((app) =>
              pickFields(app, ["uuid", "name", "fqdn", "status"])
            ),
          }
        );
      }

      const app = matches[0];
      const uuid = asString(app.uuid);
      const status = asString(app.status) || "unknown";

      const deploymentsRaw = await unwrap(
        sdk.listDeploymentsByAppUuid({ path: { uuid }, query: { take: 5 } }),
        "diagnoseApp"
      );
      const deployments = (normalizeItems(deploymentsRaw) ?? [])
        .filter(isRecord)
        .map((d) =>
          pickFields(d, [
            "deployment_uuid",
            "status",
            "created_at",
            "commit",
            "commit_message",
            "is_webhook",
          ])
        );
      const latest = deployments[0];
      const latestStatus = latest ? asString(latest.status) : undefined;

      let failedLogTail: string[] | undefined;
      const lastFailed = deployments.find((d) => asString(d.status) === "failed");
      if (lastFailed && typeof lastFailed.deployment_uuid === "string") {
        const failedDeployment = await unwrap(
          sdk.getDeploymentByUuid({
            path: { uuid: lastFailed.deployment_uuid },
          }),
          "diagnoseApp"
        );
        if (isRecord(failedDeployment)) {
          failedLogTail = extractDeploymentLogTail(failedDeployment.logs, 40);
        }
      }

      let runtimeLogs: unknown;
      try {
        runtimeLogs = await unwrap(
          sdk.getApplicationLogsByUuid({
            path: { uuid },
            query: { lines: log_lines ?? 60 },
          }),
          "diagnoseApp"
        );
      } catch (error) {
        runtimeLogs = `Runtime logs unavailable: ${error instanceof Error ? error.message : String(error)}`;
      }

      const hints = buildHints({
        status,
        latestDeploymentStatus: latestStatus,
        hasDeployments: deployments.length > 0,
      });

      return ok(
        `Diagnosis for ${asString(app.name) || uuid}: status=${status}, latest deployment=${latestStatus ?? "none"}.`,
        {
          application: redactSecrets(
            pickFields(app, ["uuid", "name", "fqdn", "status", "git_repository", "git_branch"])
          ),
          deployments,
          ...(failedLogTail ? { failed_deployment_log_tail: failedLogTail } : {}),
          runtime_logs: runtimeLogs,
          hints,
        }
      );
    }
  );
}
