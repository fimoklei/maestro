// `pnpm comment-guard [root]`: prints `file:line: match` for every comment that
// points at a workshop document, every line citing an ADR or story ID, and every
// line naming the operator's home.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript-6";

// Matched anywhere in a line; bracketed so the guard passes its own source.
const ADR_POINTERS = [/ADR[-]/, /ADR[ ]00/];
const STORY_ID = /\(J\d+\)/;
const DOCUMENT_POINTERS = [
  /docs\/research/,
  /LEARNINGS/,
  /apm-behavior/,
  /\.claude\//,
  /docs\/jobs\.md/,
  /design-principles/,
];
const HOME = /\/Users\/michielmerks/;
const SKIPPED_DIRS = new Set([
  "node_modules",
  "dist",
  "coverage",
  "storybook-static",
]);

function* filesUnder(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory() && !SKIPPED_DIRS.has(entry.name)) {
      yield* filesUnder(path);
    } else if (entry.isFile()) {
      yield path;
    }
  }
}

/** Line number (1-based) → comment text on that line. */
function commentsByLine(path, text) {
  const kind = path.endsWith(".tsx")
    ? ts.ScriptKind.TSX
    : /\.m?js$/.test(path)
      ? ts.ScriptKind.JS
      : ts.ScriptKind.TS;
  const source = ts.createSourceFile(
    path,
    text,
    ts.ScriptTarget.Latest,
    false,
    kind,
  );
  const ranges = new Map();
  const visit = (node) => {
    for (const range of [
      ...(ts.getLeadingCommentRanges(text, node.pos) ?? []),
      ...(ts.getTrailingCommentRanges(text, node.pos) ?? []),
    ]) {
      ranges.set(range.pos, range.end);
    }
    for (const child of node.getChildren(source)) visit(child);
  };
  visit(source);

  const lines = new Map();
  for (const [pos, end] of ranges) {
    const first = source.getLineAndCharacterOfPosition(pos).line + 1;
    text
      .slice(pos, end)
      .split("\n")
      .forEach((part, i) => {
        lines.set(first + i, `${lines.get(first + i) ?? ""} ${part}`);
      });
  }
  return lines;
}

function firstMatch(patterns, line) {
  for (const pattern of patterns) {
    const match = line.match(pattern);
    if (match) return match[0];
  }
  return null;
}

function findOffenders(root) {
  const offenders = [];
  const report = (path, line, match) =>
    offenders.push(
      `${relative(root, path).split(sep).join("/")}:${line}: ${match}`,
    );

  for (const top of ["packages", "tests", "scripts"]) {
    for (const path of filesUnder(join(root, top))) {
      const markup = top === "packages" && /\.(css|html)$/.test(path);
      if (!markup && !/\.(tsx?|mts|mjs|js)$/.test(path)) continue;
      const text = readFileSync(path, "utf8");
      const comments = markup ? null : commentsByLine(path, text);
      text.split("\n").forEach((line, i) => {
        const match =
          firstMatch([HOME, ...ADR_POINTERS, STORY_ID], line) ??
          firstMatch(
            DOCUMENT_POINTERS,
            markup ? line : (comments.get(i + 1) ?? ""),
          );
        if (match) report(path, i + 1, match);
      });
    }
  }

  for (const path of filesUnder(join(root, "docs", "adr"))) {
    readFileSync(path, "utf8")
      .split("\n")
      .forEach((line, i) => {
        const match = firstMatch([HOME, STORY_ID, ...DOCUMENT_POINTERS], line);
        if (match) report(path, i + 1, match);
      });
  }

  return offenders;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = resolve(
    process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), ".."),
  );
  const offenders = findOffenders(root);
  for (const offender of offenders) console.log(offender);
  if (offenders.length > 0) {
    console.error(`comment-guard: ${offenders.length} offending lines`);
    process.exitCode = 1;
  }
}
