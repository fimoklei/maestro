// `pnpm cast-guard [root]`: prints `file:line: cast` for every `as` cast in
// product code under `packages/` that no comment explains.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript-6";

const SKIPPED_DIRS = new Set([
  "node_modules",
  "dist",
  "coverage",
  "storybook-static",
]);
const TEST_CODE =
  /\.(test|stories|fake)\.tsx?$|(^|\/)test-utils\.tsx?$|-test-helpers\.tsx?$|\/\.storybook\//;

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

/** The 0-based lines that hold any part of a comment. */
function commentLines(source) {
  const text = source.text;
  const lines = new Set();
  const seen = new Set();
  // getChildren, not forEachChild: a comment can lead a bare token such as `)`.
  const visit = (node) => {
    for (const range of [
      ...(ts.getLeadingCommentRanges(text, node.pos) ?? []),
      ...(ts.getTrailingCommentRanges(text, node.end) ?? []),
    ]) {
      if (seen.has(range.pos)) continue;
      seen.add(range.pos);
      const last = lineOf(source, range.end);
      for (let line = lineOf(source, range.pos); line <= last; line++) {
        lines.add(line);
      }
    }
    for (const child of node.getChildren(source)) visit(child);
  };
  visit(source);
  return lines;
}

const lineOf = (source, pos) => source.getLineAndCharacterOfPosition(pos).line;

/** The line the statement holding `node` starts on. */
function statementLine(source, node) {
  let current = node;
  while (current.parent && !ts.isSourceFile(current.parent)) {
    if (ts.isBlock(current.parent) || ts.isModuleBlock(current.parent)) break;
    current = current.parent;
  }
  return lineOf(source, current.getStart(source));
}

function castsWithoutReason(path, text) {
  const source = ts.createSourceFile(
    path,
    text,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const comments = commentLines(source);
  const found = [];
  const visit = (node) => {
    const outermost =
      ts.isAsExpression(node) && !ts.isAsExpression(node.parent);
    if (outermost && node.type.getText(source) !== "const") {
      const castLine = lineOf(source, node.type.getStart(source));
      const from = statementLine(source, node) - 1;
      let explained = false;
      for (let line = from; line <= castLine; line++) {
        if (comments.has(line)) explained = true;
      }
      if (!explained) {
        let inner = node.expression;
        while (ts.isAsExpression(inner)) inner = inner.expression;
        const cast = text
          .slice(inner.getEnd(), node.getEnd())
          .trim()
          .replace(/\s+/g, " ");
        found.push({ line: castLine + 1, cast });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

export function findOffenders(root) {
  const offenders = [];
  for (const path of filesUnder(join(root, "packages"))) {
    const name = relative(root, path).split(sep).join("/");
    if (!/\.tsx?$/.test(path) || /\.d\.ts$/.test(path)) continue;
    if (TEST_CODE.test(name)) continue;
    const text = readFileSync(path, "utf8");
    for (const { line, cast } of castsWithoutReason(path, text)) {
      offenders.push(`${name}:${line}: ${cast}`);
    }
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
    console.error(
      `cast-guard: ${offenders.length} casts without a reason. Give every \`as\` cast in product code a comment that says why it holds, on its line or above it.`,
    );
    process.exitCode = 1;
  }
}
