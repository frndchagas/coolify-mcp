// Shared MCP plumbing for tool modules: API unwrapping, response shaping,
// write gating, and runtime payload validation.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { z as zod } from "zod";
import { COOLIFY_ALLOW_WRITE, COOLIFY_ELICITATION } from "../config.js";
import { extractErrorMessage, isHtmlResponse, toRecord } from "./helpers.js";

export async function unwrap<T>(
  promise: Promise<{ data?: T; error?: unknown }>,
  context?: string
): Promise<T> {
  const result = await promise;
  if (result.error) {
    const msg = extractErrorMessage(result.error);
    const prefix = context ? `${context}: ` : "";
    throw new Error(`${prefix}${msg}`);
  }
  if (isHtmlResponse(result.data)) {
    const prefix = context ? `${context}: ` : "";
    throw new Error(
      `${prefix}Authentication failed. API returned HTML instead of JSON. Please check COOLIFY_TOKEN and COOLIFY_BASE_URL.`
    );
  }
  return result.data as T;
}

export const ok = (text: string, data: unknown) => ({
  content: [{ type: "text" as const, text }],
  structuredContent: toRecord(data),
});

export const list = (text: string, items: unknown) => ok(text, { items });

export const listWithMeta = (
  text: string,
  items: unknown,
  meta?: Record<string, unknown>
) => ok(text, meta ? { items, meta } : { items });

export function requireWrite() {
  if (!COOLIFY_ALLOW_WRITE) {
    throw new Error(
      "Write operations are disabled (COOLIFY_ALLOW_WRITE=false)."
    );
  }
}

// Ask the human (not the model) to confirm a destructive operation via MCP
// elicitation. Progressive enhancement: clients that do not advertise the
// elicitation capability proceed as before; a decline, cancel, or missing
// confirmation aborts the call.
export async function confirmDestructive(
  server: McpServer,
  action: string,
  impact: string
): Promise<void> {
  if (!COOLIFY_ELICITATION) return;
  if (!server.server.getClientCapabilities()?.elicitation) return;
  const result = await server.server.elicitInput({
    message: `${action}\n${impact}`,
    requestedSchema: {
      type: "object",
      properties: {
        confirm: {
          type: "boolean",
          title: "Proceed?",
          description: action,
        },
      },
      required: ["confirm"],
    },
  });
  if (result.action !== "accept" || result.content?.confirm !== true) {
    throw new Error(`${action} — cancelled: the user did not confirm.`);
  }
}

// The Coolify API accepts environment_name OR environment_uuid on create
// endpoints; fail early with a clear message when neither is given.
export function requireEnvironmentRef(
  payload: Record<string, unknown>,
  context: string
): void {
  if (!payload.environment_name && !payload.environment_uuid) {
    throw new Error(
      `${context}: provide environment_name or environment_uuid (one is enough).`
    );
  }
}

// Validate a payload against an OpenAPI-generated zod schema, surfacing
// field-level issues in the error message.
export function parseBody<T>(
  schema: zod.ZodType<T>,
  payload: unknown,
  context: string
): T {
  const result = schema.safeParse(payload);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
      .join("; ");
    throw new Error(`${context}: ${issues}`);
  }
  return result.data;
}
