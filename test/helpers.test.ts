import { describe, expect, it } from "vitest";
import {
  SECRET_MASK,
  checkBearerAuth,
  extractErrorMessage,
  hasCredentialInUrl,
  isHtmlResponse,
  maskEnvVar,
  matchesAnyField,
  normalizeItems,
  paginate,
  parseMaybeJson,
  pickFields,
  redactSecrets,
  shouldRedactField,
  summarizeApplication,
  summarizeDatabase,
  summarizeResource,
  toRecord,
} from "../src/tools/helpers.js";

describe("paginate", () => {
  const items = [1, 2, 3, 4, 5];

  it("returns everything from offset when limit is undefined", () => {
    expect(paginate(items)).toEqual({
      items: [1, 2, 3, 4, 5],
      total: 5,
      offset: 0,
      hasMore: false,
    });
    expect(paginate(items, undefined, 3).items).toEqual([4, 5]);
  });

  it("pages with limit and reports hasMore", () => {
    expect(paginate(items, 2)).toEqual({
      items: [1, 2],
      total: 5,
      offset: 0,
      limit: 2,
      hasMore: true,
    });
    expect(paginate(items, 2, 4)).toEqual({
      items: [5],
      total: 5,
      offset: 4,
      limit: 2,
      hasMore: false,
    });
  });

  it("hasMore is false exactly at the boundary", () => {
    expect(paginate(items, 5).hasMore).toBe(false);
    expect(paginate(items, 4).hasMore).toBe(true);
  });

  it("clamps negative offset and zero limit", () => {
    expect(paginate(items, 2, -10).offset).toBe(0);
    expect(paginate(items, 0).items).toEqual([1]);
  });
});

describe("redactSecrets", () => {
  it("masks sensitive keys and keeps the rest", () => {
    const input = {
      name: "app",
      password: "hunter2",
      api_key: "k",
      apiKey: "k2",
      access_token: "t",
      connection_string: "cs",
      port: 5432,
    };
    const output = redactSecrets(input) as Record<string, unknown>;
    expect(output.name).toBe("app");
    expect(output.port).toBe(5432);
    expect(output.password).toBe(SECRET_MASK);
    expect(output.api_key).toBe(SECRET_MASK);
    expect(output.apiKey).toBe(SECRET_MASK);
    expect(output.access_token).toBe(SECRET_MASK);
    expect(output.connection_string).toBe(SECRET_MASK);
  });

  it("recurses into nested objects and arrays", () => {
    const output = redactSecrets({
      db: { secret: "x", host: "h" },
      list: [{ token: "t" }, "plain"],
    }) as { db: Record<string, unknown>; list: unknown[] };
    expect(output.db.secret).toBe(SECRET_MASK);
    expect(output.db.host).toBe("h");
    expect((output.list[0] as Record<string, unknown>).token).toBe(SECRET_MASK);
    expect(output.list[1]).toBe("plain");
  });

  it("masks URL fields only when credentials are embedded", () => {
    const output = redactSecrets({
      public_url: "https://example.com",
      internal_db_url: "postgres://user:pass@db:5432/app",
    }) as Record<string, unknown>;
    expect(output.public_url).toBe("https://example.com");
    expect(output.internal_db_url).toBe(SECRET_MASK);
  });

  it("passes primitives through untouched", () => {
    expect(redactSecrets("plain")).toBe("plain");
    expect(redactSecrets(42)).toBe(42);
    expect(redactSecrets(null)).toBe(null);
  });
});

describe("shouldRedactField / hasCredentialInUrl", () => {
  it("detects credentials in URLs", () => {
    expect(hasCredentialInUrl("postgres://u:p@host/db")).toBe(true);
    expect(hasCredentialInUrl("https://example.com/path")).toBe(false);
  });

  it("flags sensitive key names regardless of value", () => {
    expect(shouldRedactField("private_key", "")).toBe(true);
    expect(shouldRedactField("DATABASE_PASSWORD", "x")).toBe(true);
    expect(shouldRedactField("hostname", "db")).toBe(false);
  });
});

describe("maskEnvVar", () => {
  it("masks value and real_value and marks is_secret", () => {
    const masked = maskEnvVar({
      key: "DB_PASSWORD",
      value: "secret",
      real_value: "secret",
    }) as Record<string, unknown>;
    expect(masked.key).toBe("DB_PASSWORD");
    expect(masked.value).toBe(SECRET_MASK);
    expect(masked.real_value).toBe(SECRET_MASK);
    expect(masked.is_secret).toBe(true);
  });

  it("leaves envs without values unmarked", () => {
    const masked = maskEnvVar({ key: "EMPTY" }) as Record<string, unknown>;
    expect(masked.is_secret).toBeUndefined();
    expect(masked.value).toBeUndefined();
  });

  it("passes non-records through", () => {
    expect(maskEnvVar("raw")).toBe("raw");
  });
});

describe("isHtmlResponse", () => {
  it("detects HTML documents including leading whitespace", () => {
    expect(isHtmlResponse("<!DOCTYPE html><html></html>")).toBe(true);
    expect(isHtmlResponse("  <html lang='en'>")).toBe(true);
  });

  it("rejects JSON strings and non-strings", () => {
    expect(isHtmlResponse('{"ok":true}')).toBe(false);
    expect(isHtmlResponse(undefined)).toBe(false);
    expect(isHtmlResponse(null)).toBe(false);
  });
});

describe("extractErrorMessage", () => {
  it("handles strings, message objects, and plain objects", () => {
    expect(extractErrorMessage("boom")).toBe("boom");
    expect(extractErrorMessage({ message: "bad request" })).toBe("bad request");
    expect(extractErrorMessage({ error: "x" })).toBe('{"error":"x"}');
  });

  it("falls back on unserializable input", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(extractErrorMessage(circular)).toBe("API request failed");
    expect(extractErrorMessage(42)).toBe("API request failed");
  });
});

describe("parseMaybeJson / normalizeItems", () => {
  it("parses JSON strings and passes through invalid ones", () => {
    expect(parseMaybeJson('{"a":1}')).toEqual({ a: 1 });
    expect(parseMaybeJson("not json")).toBe("not json");
    expect(parseMaybeJson(7)).toBe(7);
  });

  it("normalizes arrays, {items}, and JSON strings of both", () => {
    expect(normalizeItems([1, 2])).toEqual([1, 2]);
    expect(normalizeItems({ items: [1] })).toEqual([1]);
    expect(normalizeItems("[1,2]")).toEqual([1, 2]);
    expect(normalizeItems('{"items":[3]}')).toEqual([3]);
    expect(normalizeItems("plain")).toBeNull();
  });

  it("unwraps Coolify's {count, deployments} envelope", () => {
    // Real shape of GET /deployments/applications/{uuid}, which the spec
    // wrongly declares as a bare array.
    const real = {
      count: 45,
      deployments: [
        { id: 11555, status: "finished" },
        { id: 11553, status: "failed" },
      ],
    };
    expect(normalizeItems(real)).toHaveLength(2);
    expect((normalizeItems(real) as { id: number }[])[0].id).toBe(11555);
  });

  it("unwraps other single-array envelopes and stays null when ambiguous", () => {
    expect(normalizeItems({ data: [7] })).toEqual([7]);
    expect(normalizeItems({ total: 1, records: ["a"] })).toEqual(["a"]);
    expect(normalizeItems({ a: [1], b: [2] })).toBeNull();
    expect(normalizeItems({ total: 0 })).toBeNull();
  });
});

describe("matchesAnyField", () => {
  const item = { type: "Application", status: "Running", id: 7 };

  it("returns true when no filter is given", () => {
    expect(matchesAnyField(item, ["type"], undefined)).toBe(true);
  });

  it("matches case-insensitively with trimming", () => {
    expect(matchesAnyField(item, ["type"], " application ")).toBe(true);
    expect(matchesAnyField(item, ["status"], "RUNNING")).toBe(true);
  });

  it("matches numbers by string value", () => {
    expect(matchesAnyField(item, ["id"], "7")).toBe(true);
  });

  it("misses when no key matches or item is not a record", () => {
    expect(matchesAnyField(item, ["type"], "database")).toBe(false);
    expect(matchesAnyField("raw", ["type"], "x")).toBe(false);
  });
});

describe("toRecord / pickFields", () => {
  it("wraps primitives and arrays, passes records through", () => {
    expect(toRecord(null)).toEqual({});
    expect(toRecord([1])).toEqual({ data: [1] });
    expect(toRecord("x")).toEqual({ data: "x" });
    expect(toRecord({ a: 1 })).toEqual({ a: 1 });
  });

  it("picks only present fields", () => {
    expect(pickFields({ a: 1, b: 2 }, ["a", "missing"])).toEqual({ a: 1 });
  });
});

describe("checkBearerAuth", () => {
  it("accepts a correct bearer token, case-insensitive scheme", () => {
    expect(checkBearerAuth("Bearer s3cret", "s3cret")).toBe(true);
    expect(checkBearerAuth("bearer s3cret", "s3cret")).toBe(true);
  });

  it("rejects missing, malformed, or wrong tokens", () => {
    expect(checkBearerAuth(undefined, "s3cret")).toBe(false);
    expect(checkBearerAuth("s3cret", "s3cret")).toBe(false);
    expect(checkBearerAuth("Basic s3cret", "s3cret")).toBe(false);
    expect(checkBearerAuth("Bearer wrong", "s3cret")).toBe(false);
    expect(checkBearerAuth("Bearer s3cret2", "s3cret")).toBe(false);
    expect(checkBearerAuth("Bearer ", "s3cret")).toBe(false);
  });
});

describe("summarizers", () => {
  it("projects summary fields", () => {
    expect(
      summarizeApplication({ uuid: "u", name: "n", fqdn: "f", git_repository: "r" })
    ).toEqual({ uuid: "u", name: "n", fqdn: "f" });
    expect(
      summarizeDatabase({ uuid: "u", type: "postgresql", internal_db_url: "x" })
    ).toEqual({ uuid: "u", type: "postgresql" });
    expect(summarizeResource({ id: 1, name: "n", extra: true })).toEqual({
      id: 1,
      name: "n",
    });
  });

  it("falls back to the original item when nothing matches", () => {
    expect(summarizeApplication({ foo: "bar" })).toEqual({ foo: "bar" });
    expect(summarizeApplication("raw")).toBe("raw");
  });
});
