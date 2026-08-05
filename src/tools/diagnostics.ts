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
  if (status.includes("exited") || status.includes("stopped")) {
    hints.push(
      "The application container is not running — startApplication({ uuid }) or check the runtime log tail for the crash reason."
    );
  }
  if (status.includes("unhealthy") || status.includes("degraded")) {
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
    "diagnoseApp",
    {
      title: "Diagnose application",
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
