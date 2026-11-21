import { readdirSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript-6";

const SKIPPED_DIRS = new Set([
  "node_modules",
  "dist",
  "coverage",
  "storybook-static",
]);

export function* filesUnder(dir) {
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

export function commentsByLine(path, text) {
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
