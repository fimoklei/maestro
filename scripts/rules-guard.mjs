// `pnpm rules-guard [root]`: prints `rule: problem` for every Claude rule file
// whose `paths:` pattern matches no file, and for every unscoped rule outside
// ALWAYS_LOADED. A renamed folder otherwise stops a rule loading without any
// failure.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, matchesGlob, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ALWAYS_LOADED = new Set(["architecture.md", "security.md"]);
const SKIPPED_DIRS = new Set([
  "node_modules",
  "dist",
  "coverage",
  "storybook-static",
  ".git",
]);
const SKIPPED_PATHS = new Set([join(".claude", "worktrees")]);

function* filesUnder(root, dir = root) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (
        !SKIPPED_DIRS.has(entry.name) &&
        !SKIPPED_PATHS.has(relative(root, path))
      ) {
        yield* filesUnder(root, path);
      }
    } else if (entry.isFile()) {
      yield relative(root, path).split(sep).join("/");
    }
  }
}

/** The `paths:` patterns of a rule, or null when it has no frontmatter. */
function pathsOf(text) {
  const frontmatter = /^---\n([\s\S]*?)\n---/.exec(text)?.[1];
  if (frontmatter === undefined) return null;
  const inline = /^paths:[ \t]*(\S.*)$/m.exec(frontmatter)?.[1];
  if (inline !== undefined) {
    return inline.split(",").map((p) => p.trim().replace(/^"|"$/g, ""));
  }
  return [...frontmatter.matchAll(/^\s+-\s+"?([^"\n]+?)"?\s*$/gm)].map(
    (m) => m[1],
  );
}

const root = resolve(
  process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), ".."),
);
const rulesDir = join(root, ".claude", "rules");
let rules;
try {
  rules = readdirSync(rulesDir).filter((name) => name.endsWith(".md"));
} catch {
  rules = [];
}

const files = [...filesUnder(root)];
const problems = [];
for (const name of rules.sort()) {
  const rule = `.claude/rules/${name}`;
  const patterns = pathsOf(readFileSync(join(rulesDir, name), "utf8"));
  if (patterns === null || patterns.length === 0) {
    if (!ALWAYS_LOADED.has(name)) {
      problems.push(
        `${rule}: no paths frontmatter, so it loads in every session`,
      );
    }
    continue;
  }
  for (const pattern of patterns) {
    if (!files.some((file) => matchesGlob(file, pattern))) {
      problems.push(`${rule}: ${pattern} matches no file`);
    }
  }
}

if (problems.length > 0) {
  console.log(problems.join("\n"));
  process.exit(1);
}
