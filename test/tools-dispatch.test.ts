import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the generated SDK: every real export becomes a recordable vi.fn, so
// the modules under test hit fakes instead of HTTP.
const sdkCalls = vi.hoisted(
  () => new Map<string, ReturnType<typeof import("vitest").vi.fn>>()
);
vi.mock("../src/generated/sdk.gen.js", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const mocked: Record<string, unknown> = {};
  for (const key of Object.keys(actual)) {
    const fn = vi.fn(async () => ({ data: { uuid: "fake-uuid", ok: true } }));
    sdkCalls.set(key, fn);
    mocked[key] = fn;
  }
  return mocked;
});

import { registerDatabaseTools } from "../src/tools/databases.js";
import { registerInfraTools } from "../src/tools/infra.js";
import { registerResourceTools } from "../src/tools/resources.js";
import { registerServiceTools } from "../src/tools/services.js";

type Handler = (args: Record<string, unknown>, extra?: unknown) => Promise<unknown>;

interface CollectedTool {
  config: { description?: string; inputSchema?: Record<string, unknown> };
  handler: Handler;
}

function collectTools(
  register: (server: never) => void
): Map<string, CollectedTool> {
  const tools = new Map<string, CollectedTool>();
  const fake = {
    registerTool(name: string, config: CollectedTool["config"], handler: Handler) {
      tools.set(name, { config, handler });
    },
  };
  register(fake as never);
  return tools;
}

function sdkFn(name: string) {
  const fn = sdkCalls.get(name);
  if (!fn) throw new Error(`SDK fn ${name} was never called`);
  return fn;
}

beforeEach(() => {
  for (const fn of sdkCalls.values()) fn.mockClear();
});

describe("database tools dispatch", () => {
  const tools = collectTools(registerDatabaseTools);

  it("createDatabase routes to the engine-specific endpoint with a validated body", async () => {
    await tools.get("createDatabase")!.handler({
      type: "postgresql",
      project_uuid: "p",
      server_uuid: "s",
      environment_name: "prod",
      environment_uuid: "e",
      extra: { postgres_user: "admin" },
    });
    const call = sdkFn("createDatabasePostgresql").mock.calls[0][0];
    expect(call.body.project_uuid).toBe("p");
    expect(call.body.postgres_user).toBe("admin");
  });

  it("createDatabase rejects payloads missing required fields with field-level context", async () => {
    await expect(
      tools.get("createDatabase")!.handler({ type: "redis", project_uuid: "p" })
    ).rejects.toThrow(/createDatabase\(redis\).*server_uuid/s);
    expect(sdkCalls.get("createDatabaseRedis")?.mock.calls ?? []).toHaveLength(0);
  });

  it("controlDatabase maps actions to start/stop/restart endpoints", async () => {
    const control = tools.get("controlDatabase")!.handler;
    await control({ uuid: "db1", action: "start" });
    await control({ uuid: "db1", action: "restart" });
    expect(sdkFn("startDatabaseByUuid").mock.calls[0][0].path.uuid).toBe("db1");
    expect(sdkFn("restartDatabaseByUuid")).toHaveBeenCalledTimes(1);
  });

  it("databaseBackups requires scheduled_backup_uuid for update and delete", async () => {
    const backups = tools.get("databaseBackups")!.handler;
    await expect(
      backups({ uuid: "db1", action: "update", frequency: "0 0 * * *" })
    ).rejects.toThrow(/scheduled_backup_uuid is required/);
    await expect(backups({ uuid: "db1", action: "delete" })).rejects.toThrow(
      /scheduled_backup_uuid is required/
    );
  });

  it("databaseEnvs masks values on list unless showSecrets", async () => {
    sdkFn("listEnvsByDatabaseUuid").mockResolvedValueOnce({
      data: [{ key: "DB_PASSWORD", value: "hunter2" }],
    });
    const result = (await tools
      .get("databaseEnvs")!
      .handler({ uuid: "db1", action: "list" })) as {
      structuredContent: { items: Array<Record<string, unknown>> };
    };
    expect(result.structuredContent.items[0].value).toBe("********");
  });
});

describe("service tools dispatch", () => {
  const tools = collectTools(registerServiceTools);

  it("controlService maps actions", async () => {
    await tools.get("controlService")!.handler({ uuid: "svc", action: "stop" });
    expect(sdkFn("stopServiceByUuid").mock.calls[0][0].path.uuid).toBe("svc");
  });

  it("serviceEnvs bulk_update requires a non-empty envs array and wraps it as {data}", async () => {
    const envs = tools.get("serviceEnvs")!.handler;
    await expect(envs({ uuid: "svc", action: "bulk_update" })).rejects.toThrow(
      /envs array is required/
    );
    await envs({
      uuid: "svc",
      action: "bulk_update",
      envs: [{ key: "A", value: "1" }],
    });
    expect(sdkFn("updateEnvsByServiceUuid").mock.calls[0][0].body.data).toEqual([
      { key: "A", value: "1" },
    ]);
  });
});

describe("resource tools dispatch", () => {
  const tools = collectTools(registerResourceTools);

  it("storages routes by resource type and validates create bodies", async () => {
    await tools.get("storages")!.handler({
      resource: "service",
      uuid: "svc",
      action: "create",
      type: "persistent",
      mount_path: "/data",
      resource_uuid: "sub1",
    });
    expect(sdkFn("createStorageByServiceUuid").mock.calls[0][0].body.mount_path).toBe(
      "/data"
    );
    await expect(
      tools.get("storages")!.handler({
        resource: "application",
        uuid: "app",
        action: "create",
        type: "persistent",
      })
    ).rejects.toThrow(/mount_path/);
  });

  it("storages update injects storage_uuid into the body", async () => {
    await tools.get("storages")!.handler({
      resource: "database",
      uuid: "db",
      action: "update",
      storage_uuid: "st1",
      type: "persistent",
      mount_path: "/data2",
    });
    expect(sdkFn("updateStorageByDatabaseUuid").mock.calls[0][0].body.uuid).toBe("st1");
  });

  it("scheduledTasks requires task_uuid where the API needs one", async () => {
    await expect(
      tools.get("scheduledTasks")!.handler({
        resource: "application",
        uuid: "app",
        action: "delete",
      })
    ).rejects.toThrow(/task_uuid is required/);
  });

  it("teams requires id for get/members but not for current", async () => {
    const teams = tools.get("teams")!.handler;
    await expect(teams({ action: "get" })).rejects.toThrow(/id is required/);
    await teams({ action: "current" });
    expect(sdkFn("getCurrentTeam")).toHaveBeenCalledTimes(1);
  });
});

describe("infra tools dispatch", () => {
  const tools = collectTools(registerInfraTools);

  it("getPrivateKey masks key material by default", async () => {
    const keyResponse = {
      data: { uuid: "k1", name: "deploy", private_key: "-----BEGIN..." },
    };
    sdkFn("getPrivateKeyByUuid")
      .mockResolvedValueOnce(keyResponse)
      .mockResolvedValueOnce(keyResponse);
    const masked = (await tools
      .get("getPrivateKey")!
      .handler({ uuid: "k1" })) as { structuredContent: Record<string, unknown> };
    expect(masked.structuredContent.private_key).toBe("********");

    const revealed = (await tools
      .get("getPrivateKey")!
      .handler({ uuid: "k1", showSecrets: true })) as {
      structuredContent: Record<string, unknown>;
    };
    expect(revealed.structuredContent.private_key).toBe("-----BEGIN...");
  });

  it("getGithubAppBranches passes all path params", async () => {
    await tools.get("getGithubAppBranches")!.handler({
      github_app_id: 7,
      owner: "acme",
      repo: "web",
    });
    expect(sdkFn("loadBranches").mock.calls[0][0].path).toEqual({
      github_app_id: 7,
      owner: "acme",
      repo: "web",
    });
  });
});

describe("tool catalog smoke test", () => {
  it("module tool names are unique and documented", () => {
    const all = new Map<string, CollectedTool>();
    for (const register of [
      registerDatabaseTools,
      registerServiceTools,
      registerResourceTools,
      registerInfraTools,
    ]) {
      for (const [name, tool] of collectTools(register)) {
        expect(all.has(name)).toBe(false);
        all.set(name, tool);
      }
    }
    expect(all.size).toBe(25);
    for (const [name, tool] of all) {
      expect(tool.config.description, `${name} needs a description`).toBeTruthy();
      expect(tool.config.inputSchema, `${name} needs an inputSchema`).toBeTruthy();
    }
  });
});
