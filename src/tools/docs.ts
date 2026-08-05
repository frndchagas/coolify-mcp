import { readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z as zod } from "zod";
import { list } from "./common.js";

export interface DocEntry {
  /** title */
  t: string;
  /** canonical url */
  u: string;
  /** headings joined with | */
  h: string;
  /** plain-text body (truncated at index build time) */
  b: string;
}

export interface DocMatch {
  title: string;
  url: string;
  score: number;
  snippet: string;
}

let cachedIndex: DocEntry[] | null = null;
function loadIndex(): DocEntry[] {
  if (!cachedIndex) {
    const indexUrl = new URL("../../docs-index.json", import.meta.url);
    cachedIndex = JSON.parse(readFileSync(indexUrl, "utf8")) as DocEntry[];
  }
  return cachedIndex;
}

export function scoreDoc(
  entry: DocEntry,
  terms: string[],
  requireAll: boolean
): number {
  const title = entry.t.toLowerCase();
  const headings = entry.h.toLowerCase();
  const body = entry.b.toLowerCase();
  let score = 0;
  for (const term of terms) {
    let termScore = 0;
    if (title.includes(term)) termScore += 5;
    if (headings.includes(term)) termScore += 3;
    const occurrences = body.split(term).length - 1;
    termScore += Math.min(occurrences, 5);
    if (termScore === 0 && requireAll) return 0;
    score += termScore;
  }
  return score;
}

export function makeSnippet(body: string, term: string, radius = 160): string {
  const at = body.toLowerCase().indexOf(term);
  if (at === -1) return body.slice(0, radius * 2);
  const start = Math.max(0, at - radius);
  const end = Math.min(body.length, at + term.length + radius);
  return `${start > 0 ? "…" : ""}${body.slice(start, end)}${end < body.length ? "…" : ""}`;
}

export function searchDocsIndex(
  index: DocEntry[],
  query: string,
  limit = 5
): DocMatch[] {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 1);
  if (terms.length === 0) return [];

  const rank = (requireAll: boolean) =>
    index
      .map((entry) => ({ entry, score: scoreDoc(entry, terms, requireAll) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

  let ranked = rank(true);
  if (ranked.length === 0 && terms.length > 1) {
    ranked = rank(false);
  }

  return ranked.map(({ entry, score }) => ({
    title: entry.t,
    url: entry.u,
    score,
    snippet: makeSnippet(entry.b, terms[0]),
  }));
}

export function registerDocsTools(server: McpServer) {
  server.registerTool(
    "searchDocs",
    {
      title: "Search Coolify docs",
      description:
        "Full-text search across the official Coolify documentation using a local index bundled with this server (no network). Returns page titles, canonical coolify.io/docs URLs, and snippets.",
      inputSchema: {
        query: zod.string().min(2).describe("Search terms"),
        limit: zod.number().int().min(1).max(20).optional(),
      },
    },
    async ({ query, limit }) => {
      const results = searchDocsIndex(loadIndex(), query, limit ?? 5);
      return list(
        results.length > 0
          ? `${results.length} documentation pages match "${query}".`
          : `No documentation pages match "${query}".`,
        results
      );
    }
  );
}
