import { describe, expect, it } from "vitest";
import { describeApps, isRunning, toAppRefs } from "../src/tools/batch.js";
import { buildServerHints, matchServer } from "../src/tools/diagnostics.js";

describe("toAppRefs / isRunning", () => {
  it("extracts uuid/name/status and drops invalid entries", () => {
    const refs = toAppRefs([
      { uuid: "a1", name: "api", status: "running:healthy" },
      { uuid: "a2", status: "exited" },
      { name: "no-uuid" },
      "raw",
    ]);
    expect(refs).toEqual([
      { uuid: "a1", name: "api", status: "running:healthy" },
      { uuid: "a2", name: "a2", status: "exited" },
    ]);
  });

  it("classifies running statuses", () => {
    expect(isRunning("running:healthy")).toBe(true);
    expect(isRunning("Running")).toBe(true);
    expect(isRunning("exited")).toBe(false);
    expect(isRunning("")).toBe(false);
  });
});

describe("describeApps", () => {
  it("lists names and truncates long lists", () => {
    const apps = Array.from({ length: 10 }, (_, i) => ({
      uuid: `u${i}`,
      name: `app${i}`,
      status: "running",
    }));
    expect(describeApps(apps.slice(0, 2))).toBe("app0, app1");
    expect(describeApps(apps)).toContain("and 2 more");
  });
});

describe("matchServer", () => {
  const servers = [
    { uuid: "s1", name: "hetzner-1", ip: "10.0.0.1" },
    { uuid: "s2", name: "hetzner-2", ip: "10.0.0.2" },
  ];

  it("matches by uuid, name, or ip", () => {
    expect(matchServer(servers, "s2")[0].name).toBe("hetzner-2");
    expect(matchServer(servers, "HETZNER-1")[0].uuid).toBe("s1");
    expect(matchServer(servers, "10.0.0.2")[0].uuid).toBe("s2");
    expect(matchServer(servers, "nope")).toHaveLength(0);
  });
});

describe("buildServerHints", () => {
  it("flags unhealthy resources", () => {
    const hints = buildServerHints({
      total: 3,
      unhealthy: [{ name: "worker", status: "exited" }],
    });
    expect(hints.join(" ")).toContain("worker: exited");
  });

  it("reports empty servers and all-healthy servers", () => {
    expect(buildServerHints({ total: 0, unhealthy: [] }).join(" ")).toContain(
      "No resources"
    );
    expect(buildServerHints({ total: 4, unhealthy: [] }).join(" ")).toContain(
      "running status"
    );
  });
});
