// Builds docs-index.json from the official Coolify documentation repo
// (coollabsio/coolify-docs, branch v4.x). Run on demand via `npm run docs:index`
// and commit the result — the searchDocs tool reads it locally at runtime.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

const DOCS_TARBALL =
  "https://codeload.github.com/coollabsio/coolify-docs/tar.gz/refs/heads/v4.x";
const BODY_LIMIT = 4000;

const workDir = mkdtempSync(join(tmpdir(), "coolify-docs-"));
try {
  console.log(`Downloading ${DOCS_TARBALL}`);
  const tarball = join(workDir, "docs.tar.gz");
  const response = await fetch(DOCS_TARBALL);
  if (!response.ok) {
    throw new Error(`Failed to download docs tarball: ${response.status}`);
  }
  writeFileSync(tarball, Buffer.from(await response.arrayBuffer()));
  execFileSync("tar", ["-xzf", tarball, "-C", workDir]);

  const rootEntry = readdirSync(workDir).find((name) =>
    name.startsWith("coolify-docs-")
  );
  const contentDir = join(workDir, rootEntry, "content", "docs");

  const entries = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (name.endsWith(".mdx") || name.endsWith(".md")) {
        entries.push(full);
      }
    }
  };
  walk(contentDir);

  const index = [];
  for (const file of entries) {
    const raw = readFileSync(file, "utf8");

    let title = "";
    let body = raw;
    const frontmatter = raw.match(/^---\n([\s\S]*?)\n---\n/);
    if (frontmatter) {
      body = raw.slice(frontmatter[0].length);
      const titleLine = frontmatter[1].match(/^title:\s*["']?(.+?)["']?\s*$/m);
      if (titleLine) title = titleLine[1];
    }

    const headings = [...body.matchAll(/^#{1,4}\s+(.+)$/gm)].map((m) =>
      m[1].replace(/[#*`]/g, "").trim()
    );

    const text = body
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/<[^>\n]+>/g, " ")
      .replace(/^import .*$/gm, " ")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/[#*_`>|]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, BODY_LIMIT);

    const slug = relative(contentDir, file)
      .replace(/\\/g, "/")
      .replace(/\.(mdx|md)$/, "")
      .replace(/\/index$/, "");
    if (!title) title = headings[0] ?? slug;

    index.push({
      t: title,
      u: `https://coolify.io/docs/${slug}`,
      h: headings.join(" | "),
      b: text,
    });
  }

  index.sort((a, b) => a.u.localeCompare(b.u));
  writeFileSync("docs-index.json", `${JSON.stringify(index)}\n`);
  const size = statSync("docs-index.json").size;
  console.log(
    `Wrote docs-index.json: ${index.length} pages, ${(size / 1024).toFixed(0)} KiB`
  );
} finally {
  rmSync(workDir, { recursive: true, force: true });
}
