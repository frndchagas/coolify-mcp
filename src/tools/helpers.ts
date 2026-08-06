// Pure data helpers shared by the Coolify tools. No MCP or config dependencies.

import { timingSafeEqual } from "node:crypto";

// Constant-time bearer-token check for the HTTP transport.
export function checkBearerAuth(
  authorizationHeader: string | undefined,
  expectedToken: string
): boolean {
  if (!authorizationHeader) return false;
  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;
  const given = Buffer.from(match[1]);
  const expected = Buffer.from(expectedToken);
  if (given.length !== expected.length) return false;
  return timingSafeEqual(given, expected);
}

export const SECRET_MASK = "********";
export const RESOURCE_TYPE_KEYS = [
  "type",
  "resource_type",
  "resourceable_type",
  "kind",
];
export const RESOURCE_STATUS_KEYS = ["status", "state"];
export const DATABASE_TYPE_KEYS = ["type", "database_type", "kind"];
export const SENSITIVE_KEY_PATTERN =
  /(pass(word)?|secret|token|api[_-]?key|private[_-]?key|access[_-]?key|credential|connection|string|dsn)/i;
export const URL_KEY_PATTERN = /(url|uri|dsn)/i;

export function extractErrorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null) {
    if ("message" in error) {
      return String((error as { message: unknown }).message);
    }
    try {
      return JSON.stringify(error);
    } catch {
      return "API request failed";
    }
  }
  return "API request failed";
}

export function isHtmlResponse(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim().toLowerCase();
  return trimmed.startsWith("<!doctype html") || trimmed.startsWith("<html");
}

// Convert any data to Record for structuredContent (single conversion point)
export function toRecord(data: unknown): Record<string, unknown> {
  if (data === null || data === undefined) return {};
  if (typeof data === "object" && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  // Wrap primitives and arrays in a data property
  return { data };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

// Coolify wraps some list responses in an envelope even where the OpenAPI
// spec declares a bare array — e.g. GET /deployments/applications/{uuid}
// returns {count, deployments: [...]}. Unwrap known envelope keys first,
// then fall back to any envelope with exactly one array-valued property.
const ENVELOPE_ARRAY_KEYS = ["items", "deployments", "data", "resources"];

export function normalizeItems(value: unknown): unknown[] | null {
  const parsed = parseMaybeJson(value);
  if (Array.isArray(parsed)) return parsed;
  if (!isRecord(parsed)) return null;
  for (const key of ENVELOPE_ARRAY_KEYS) {
    const candidate = parsed[key];
    if (Array.isArray(candidate)) return candidate;
  }
  const arrayValues = Object.values(parsed).filter((v): v is unknown[] =>
    Array.isArray(v)
  );
  return arrayValues.length === 1 ? arrayValues[0] : null;
}

function normalizeString(value: string): string {
  return value.trim().toLowerCase();
}

export function matchesAnyField(
  item: unknown,
  keys: string[],
  expected?: string
): boolean {
  if (!expected) return true;
  if (!isRecord(item)) return false;
  const expectedValue = normalizeString(expected);
  for (const key of keys) {
    const raw = item[key];
    if (typeof raw === "string" && normalizeString(raw) === expectedValue) {
      return true;
    }
    if (typeof raw === "number" && String(raw) === expectedValue) {
      return true;
    }
  }
  return false;
}

export function paginate<T>(items: T[], limit?: number, offset?: number) {
  const safeOffset = Math.max(0, offset ?? 0);
  if (limit === undefined) {
    return {
      items: items.slice(safeOffset),
      total: items.length,
      offset: safeOffset,
      hasMore: false,
    };
  }
  const safeLimit = Math.max(1, limit);
  return {
    items: items.slice(safeOffset, safeOffset + safeLimit),
    total: items.length,
    offset: safeOffset,
    limit: safeLimit,
    hasMore: safeOffset + safeLimit < items.length,
  };
}

export function pickFields(
  source: Record<string, unknown>,
  fields: string[]
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    if (field in source) {
      result[field] = source[field];
    }
  }
  return result;
}

export function summarizeResource(item: unknown): unknown {
  if (!isRecord(item)) return item;
  const summary = pickFields(item, ["id", "name", "status", "type"]);
  return Object.keys(summary).length > 0 ? summary : item;
}

function maskEnvValue(value: unknown): unknown {
  if (value === undefined || value === null) return value;
  return SECRET_MASK;
}

export function maskEnvVar(item: unknown): unknown {
  if (!isRecord(item)) return item;
  const hasValue = item.value !== undefined || item.real_value !== undefined;
  return {
    ...item,
    value: maskEnvValue(item.value),
    real_value: maskEnvValue(item.real_value),
    ...(hasValue ? { is_secret: true } : {}),
  };
}

export function hasCredentialInUrl(value: string): boolean {
  return /:\/\/[^/]+@/.test(value);
}

export function shouldRedactField(key: string, value: unknown): boolean {
  if (SENSITIVE_KEY_PATTERN.test(key)) return true;
  if (
    URL_KEY_PATTERN.test(key) &&
    typeof value === "string" &&
    hasCredentialInUrl(value)
  ) {
    return true;
  }
  return false;
}

export function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => redactSecrets(item));
  if (!isRecord(value)) return value;
  const result: Record<string, unknown> = {};
  for (const [key, fieldValue] of Object.entries(value)) {
    if (shouldRedactField(key, fieldValue)) {
      result[key] = SECRET_MASK;
      continue;
    }
    result[key] = redactSecrets(fieldValue);
  }
  return result;
}

export function summarizeApplication(item: unknown): unknown {
  if (!isRecord(item)) return item;
  const summary = pickFields(item, ["id", "uuid", "name", "status", "fqdn"]);
  return Object.keys(summary).length > 0 ? summary : item;
}

// Coolify deployment statuses observed in the wild: queued, in_progress,
// finished, failed, cancelled-by-user. Anything cancelled-* is terminal.
export function isTerminalDeploymentStatus(status: string): boolean {
  const normalized = status.trim().toLowerCase();
  return (
    normalized === "finished" ||
    normalized === "failed" ||
    normalized.startsWith("cancelled")
  );
}

// Deployment logs arrive as a JSON string of [{output, type, timestamp, ...}].
export function extractDeploymentLogTail(
  logs: unknown,
  maxLines = 40
): string[] {
  const parsed = parseMaybeJson(logs);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((entry) =>
      isRecord(entry) && typeof entry.output === "string" ? entry.output : null
    )
    .filter((line): line is string => line !== null && line.trim() !== "")
    .slice(-maxLines);
}

export function summarizeDatabase(item: unknown): unknown {
  if (!isRecord(item)) return item;
  const summary = pickFields(item, [
    "id",
    "uuid",
    "name",
    "status",
    "type",
    "database_type",
    "host",
    "port",
  ]);
  return Object.keys(summary).length > 0 ? summary : item;
}
