import { describe, expect, it } from "vitest";
import { buildHints, matchApplication } from "../src/tools/diagnostics.js";
import {
  extractDeploymentLogTail,
  isTerminalDeploymentStatus,
} from "../src/tools/helpers.js";

const apps = [
  { uuid: "abc123", name: "api", fqdn: "https://api.example.com", status: "running" },
  { uuid: "def456", name: "worker", fqdn: "", status: "exited" },
  { uuid: "ghi789", name: "api-staging", fqdn: "https://staging.api.example.com", status: "running" },
];

describe("matchApplication", () => {
  it("matches by exact uuid and name", () => {
    expect(matchApplication(apps, "def456")).toHaveLength(1);
    expect(matchApplication(apps, "worker")[0].uuid).toBe("def456");
  });

  it("matches domains by substring, case-insensitively", () => {
    expect(matchApplication(apps, "STAGING.api.example.com")[0].uuid).toBe("ghi789");
  });

  it("returns multiple candidates on ambiguous domains", () => {
    expect(matchApplication(apps, "api.example.com")).toHaveLength(2);
  });

  it("returns empty for no match and ignores non-records", () => {
    expect(matchApplication(apps, "nope")).toHaveLength(0);
    expect(matchApplication(["raw", 42], "api")).toHaveLength(0);
  });
});

describe("buildHints", () => {
  it("flags failed deployments", () => {
    const hints = buildHints({
      status: "running",
      latestDeploymentStatus: "failed",
      hasDeployments: true,
    });
    expect(hints.join(" ")).toContain("failed");
  });

  it("flags stopped containers and missing deployments", () => {
    expect(
      buildHints({ status: "exited", hasDeployments: true }).join(" ")
    ).toContain("not running");
    expect(
      buildHints({ status: "running", hasDeployments: false }).join(" ")
    ).toContain("No deployments");
  });

  it("falls back to a no-problem hint", () => {
    const hints = buildHints({
      status: "running",
      latestDeploymentStatus: "finished",
      hasDeployments: true,
    });
    expect(hints).toHaveLength(1);
    expect(hints[0]).toContain("No obvious problem");
  });
});

describe("deployment helpers", () => {
  it("classifies terminal statuses", () => {
    expect(isTerminalDeploymentStatus("finished")).toBe(true);
    expect(isTerminalDeploymentStatus("FAILED")).toBe(true);
    expect(isTerminalDeploymentStatus("cancelled-by-user")).toBe(true);
    expect(isTerminalDeploymentStatus("in_progress")).toBe(false);
    expect(isTerminalDeploymentStatus("queued")).toBe(false);
  });

  it("extracts the log tail from JSON-encoded deployment logs", () => {
    const logs = JSON.stringify([
      { output: "step 1", type: "stdout" },
      { output: "", type: "stdout" },
      { output: "error: build failed", type: "stderr" },
    ]);
    expect(extractDeploymentLogTail(logs)).toEqual([
      "step 1",
      "error: build failed",
    ]);
    expect(extractDeploymentLogTail(logs, 1)).toEqual(["error: build failed"]);
    expect(extractDeploymentLogTail("not json")).toEqual([]);
    expect(extractDeploymentLogTail(undefined)).toEqual([]);
  });
});
