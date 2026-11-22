import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { commentsByLine, filesUnder } from "./lib/comments.mjs";

export const BASELINE = "scripts/comment-baseline.json";

const DIRECTIVE =
  /^\s*(\/\/\/?|\/\*\*?)\s*(biome-ignore|@ts-expect-error|@ts-ignore|@ts-nocheck|@vitest-environment|<reference|@jsx|@__PURE__)/;

export function countCommentLines(root) {
  const counts = {};
  for (const top of ["packages", "tests", "scripts"]) {
    for (const path of filesUnder(join(root, top))) {
      if (!/\.(tsx?|mts|mjs|js)$/.test(path)) continue;
      const lines = commentsByLine(path, readFileSync(path, "utf8"));
      const count = [...lines.values()].filter(
        (text) => !DIRECTIVE.test(text),
      ).length;
      if (count > 0) counts[relative(root, path).split(sep).join("/")] = count;
    }
  }
  return counts;
}

function readBaseline(root) {
  try {
    return JSON.parse(readFileSync(join(root, BASELINE), "utf8"));
  } catch {
    return {};
  }
}

export function checkRatchet(root) {
  const counts = countCommentLines(root);
  const baseline = readBaseline(root);
  const files = [
    ...new Set([...Object.keys(counts), ...Object.keys(baseline)]),
  ];
  return files.sort().flatMap((file) => {
    const count = counts[file] ?? 0;
    const allowed = baseline[file] ?? 0;
    if (count === allowed) return [];
    const stale = count < allowed ? " (stale)" : "";
    return [`${file}: ${count} comment lines, baseline ${allowed}${stale}`];
  });
}

function writeBaseline(root, counts) {
  const sorted = Object.fromEntries(
    Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)),
  );
  writeFileSync(join(root, BASELINE), `${JSON.stringify(sorted, null, 2)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const root = resolve(
    args.find((arg) => !arg.startsWith("--")) ??
      join(dirname(fileURLToPath(import.meta.url)), ".."),
  );
  const update = args.includes("--update");
  const offenders = checkRatchet(root);
  const grown = offenders.filter((line) => !line.endsWith("(stale)"));
  for (const offender of update ? grown : offenders) console.log(offender);

  if (grown.length > 0) {
    console.error(
      `comment-ratchet: ${grown.length} files gained comments. New code carries no comments: say it with a name, a type or a test name instead. Tool directives (biome-ignore, @ts-expect-error) are exempt.`,
    );
    process.exitCode = 1;
  } else if (update) {
    writeBaseline(root, countCommentLines(root));
  } else if (offenders.length > 0) {
    console.error(
      `comment-ratchet: ${offenders.length} files have fewer comments than the baseline. Run \`pnpm comment-ratchet --update\` to lock the drop in.`,
    );
    process.exitCode = 1;
  }
}
