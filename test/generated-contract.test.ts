import { describe, expect, it, vi } from "vitest";
import * as sdk from "../src/generated/sdk.gen.js";

function transport() {
  return {
    get: vi.fn(),
    post: vi.fn(),
  };
}

const mutatingOperations = [
  [
    "start application",
    "/applications/{uuid}/start",
    (client: ReturnType<typeof transport>) =>
      sdk.startApplicationByUuid({ client: client as never, path: { uuid: "app" } }),
  ],
  [
    "stop application",
    "/applications/{uuid}/stop",
    (client: ReturnType<typeof transport>) =>
      sdk.stopApplicationByUuid({ client: client as never, path: { uuid: "app" } }),
  ],
  [
    "restart application",
    "/applications/{uuid}/restart",
    (client: ReturnType<typeof transport>) =>
      sdk.restartApplicationByUuid({ client: client as never, path: { uuid: "app" } }),
  ],
  [
    "start database",
    "/databases/{uuid}/start",
    (client: ReturnType<typeof transport>) =>
      sdk.startDatabaseByUuid({ client: client as never, path: { uuid: "db" } }),
  ],
  [
    "stop database",
    "/databases/{uuid}/stop",
    (client: ReturnType<typeof transport>) =>
      sdk.stopDatabaseByUuid({ client: client as never, path: { uuid: "db" } }),
  ],
  [
    "restart database",
    "/databases/{uuid}/restart",
    (client: ReturnType<typeof transport>) =>
      sdk.restartDatabaseByUuid({ client: client as never, path: { uuid: "db" } }),
  ],
  [
    "start service",
    "/services/{uuid}/start",
    (client: ReturnType<typeof transport>) =>
      sdk.startServiceByUuid({ client: client as never, path: { uuid: "service" } }),
  ],
  [
    "stop service",
    "/services/{uuid}/stop",
    (client: ReturnType<typeof transport>) =>
      sdk.stopServiceByUuid({ client: client as never, path: { uuid: "service" } }),
  ],
  [
    "restart service",
    "/services/{uuid}/restart",
    (client: ReturnType<typeof transport>) =>
      sdk.restartServiceByUuid({ client: client as never, path: { uuid: "service" } }),
  ],
  [
    "deploy",
    "/deploy",
    (client: ReturnType<typeof transport>) =>
      sdk.deployByTagOrUuid({ client: client as never, query: { uuid: "app" } }),
  ],
  [
    "validate server",
    "/servers/{uuid}/validate",
    (client: ReturnType<typeof transport>) =>
      sdk.validateServerByUuid({ client: client as never, path: { uuid: "server" } }),
  ],
] as const;

describe("Coolify v4.3.10 generated transport contract", () => {
  it.each(mutatingOperations)("%s uses POST %s", (_name, url, invoke) => {
    const client = transport();

    invoke(client);

    expect(client.post).toHaveBeenCalledWith(expect.objectContaining({ url }));
    expect(client.get).not.toHaveBeenCalled();
  });

  it.each([
    ["current team", "/team", sdk.getTokenTeam],
    ["current team members", "/team/members", sdk.getTokenTeamMembers],
  ] as const)("reads %s from %s", (_name, url, invoke) => {
    const client = transport();

    invoke({ client: client as never });

    expect(client.get).toHaveBeenCalledWith(expect.objectContaining({ url }));
    expect(client.post).not.toHaveBeenCalled();
  });
});
