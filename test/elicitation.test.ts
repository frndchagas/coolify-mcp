import { describe, expect, it, vi } from "vitest";
import { confirmDestructive } from "../src/tools/common.js";

function fakeServer(
  capabilities: Record<string, unknown> | undefined,
  elicitResult?: Record<string, unknown>
) {
  const elicitInput = vi.fn(async () => elicitResult ?? { action: "accept" });
  const server = {
    server: {
      getClientCapabilities: () => capabilities,
      elicitInput,
    },
  };
  return { server: server as never, elicitInput };
}

describe("confirmDestructive", () => {
  it("proceeds silently when the client does not support elicitation", async () => {
    const { server, elicitInput } = fakeServer(undefined);
    await expect(
      confirmDestructive(server, "Delete X", "gone forever")
    ).resolves.toBeUndefined();
    expect(elicitInput).not.toHaveBeenCalled();
  });

  it("proceeds when the user confirms", async () => {
    const { server, elicitInput } = fakeServer(
      { elicitation: {} },
      { action: "accept", content: { confirm: true } }
    );
    await confirmDestructive(server, "Delete database db1", "volumes go too");
    expect(elicitInput).toHaveBeenCalledTimes(1);
    const params = elicitInput.mock.calls[0][0] as { message: string };
    expect(params.message).toContain("Delete database db1");
    expect(params.message).toContain("volumes go too");
  });

  it("aborts when the user declines, cancels, or does not tick confirm", async () => {
    for (const result of [
      { action: "decline" },
      { action: "cancel" },
      { action: "accept", content: { confirm: false } },
      { action: "accept", content: {} },
    ]) {
      const { server } = fakeServer({ elicitation: {} }, result);
      await expect(
        confirmDestructive(server, "Delete X", "impact")
      ).rejects.toThrow(/cancelled/);
    }
  });
});
