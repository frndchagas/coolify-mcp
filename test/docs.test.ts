import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DocEntry,
  makeSnippet,
  scoreDoc,
  searchDocsIndex,
} from "../src/tools/docs.js";

const fakeIndex: DocEntry[] = [
  {
    t: "Docker Compose",
    u: "https://coolify.io/docs/applications/build-packs/docker-compose",
    h: "Overview | Environment Variables",
    b: "Deploy applications with docker compose. Coolify parses the compose file and creates services.",
  },
  {
    t: "Environment Variables",
    u: "https://coolify.io/docs/applications/environment-variables",
    h: "Shared Variables",
    b: "Environment variables can be shared between resources and marked as build time.",
  },
  {
    t: "Backups",
    u: "https://coolify.io/docs/databases/backups",
    h: "S3 | Retention",
    b: "Scheduled database backups can be stored locally or in S3 buckets with retention policies.",
  },
];

describe("scoreDoc", () => {
  it("weights title > headings > body", () => {
    const [compose, envVars] = fakeIndex;
    expect(scoreDoc(compose, ["docker"], true)).toBeGreaterThan(
      scoreDoc(envVars, ["variables"], true) > 0 ? 0 : 0
    );
    expect(scoreDoc(compose, ["compose"], true)).toBeGreaterThanOrEqual(5 + 2);
    expect(scoreDoc(envVars, ["environment"], true)).toBeGreaterThanOrEqual(5);
  });

  it("returns 0 in AND mode when a term is missing", () => {
    expect(scoreDoc(fakeIndex[2], ["backups", "docker"], true)).toBe(0);
    expect(scoreDoc(fakeIndex[2], ["backups", "docker"], false)).toBeGreaterThan(0);
  });
});

describe("searchDocsIndex", () => {
  it("ranks the most relevant page first and respects limit", () => {
    const results = searchDocsIndex(fakeIndex, "docker compose", 2);
    expect(results[0].url).toContain("docker-compose");
    expect(results.length).toBeLessThanOrEqual(2);
    expect(results[0].snippet.toLowerCase()).toContain("docker");
  });

  it("falls back to OR when AND finds nothing", () => {
    const results = searchDocsIndex(fakeIndex, "backups nonexistentterm");
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Backups");
  });

  it("returns empty for queries with no usable terms", () => {
    expect(searchDocsIndex(fakeIndex, "a")).toEqual([]);
  });
});

describe("makeSnippet", () => {
  it("centers the snippet on the term with ellipses", () => {
    const body = `${"x".repeat(300)} target ${"y".repeat(300)}`;
    const snippet = makeSnippet(body, "target");
    expect(snippet).toContain("target");
    expect(snippet.startsWith("…")).toBe(true);
    expect(snippet.endsWith("…")).toBe(true);
  });
});

describe("bundled index integration", () => {
  it("real docs-index.json answers a docker compose query", () => {
    const index = JSON.parse(
      readFileSync(new URL("../docs-index.json", import.meta.url), "utf8")
    ) as DocEntry[];
    expect(index.length).toBeGreaterThan(300);
    const results = searchDocsIndex(index, "docker compose environment");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].url).toMatch(/^https:\/\/coolify\.io\/docs\//);
  });
});
