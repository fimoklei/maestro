// `pnpm impeccable-guard [root] [launcher]`: prints `file:line: [rule] snippet`
// for every design anti-pattern `impeccable detect` finds in packages/web/src,
// after the shared ignores in .impeccable/config.json. Impeccable is installed
// per worktree and never committed, so where it is missing the scan is skipped.
import { spawnSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const LAUNCHER = ".claude/skills/impeccable/scripts/impeccable";
// `detect` exits 0 when clean and 2 when it found something.
const FOUND = 2;

const isFinding = (item) =>
  typeof item === "object" &&
  item !== null &&
  typeof item.antipattern === "string" &&
  typeof item.file === "string" &&
  Number.isInteger(item.line) &&
  typeof item.snippet === "string";

/** The findings as `file:line: [rule] snippet`, or null where impeccable is missing. */
export function findOffenders(given, launcher) {
  if (!existsSync(launcher)) return null;
  // Impeccable matches its ignores against resolved paths; macOS's tmpdir is a symlink.
  const root = realpathSync(given);
  const run = spawnSync(
    launcher,
    ["detect", "--json", join(root, "packages", "web", "src")],
    { cwd: root, encoding: "utf8" },
  );
  if (run.status !== 0 && run.status !== FOUND) {
    throw new Error(`impeccable detect exited ${run.status}`);
  }
  const findings = JSON.parse(run.stdout || "[]");
  if (!Array.isArray(findings) || !findings.every(isFinding)) {
    throw new Error("impeccable detect printed an unexpected shape");
  }
  return findings.map(
    ({ antipattern, file, line, snippet }) =>
      `${relative(root, file).split(sep).join("/")}:${line}: [${antipattern}] ${snippet}`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = resolve(
    process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), ".."),
  );
  const launcher = resolve(process.argv[3] ?? join(root, LAUNCHER));
  const offenders = findOffenders(root, launcher);
  if (offenders === null) {
    console.error("impeccable-guard: skipped, impeccable is not installed");
  } else {
    for (const offender of offenders) console.log(offender);
    if (offenders.length > 0) {
      console.error(`impeccable-guard: ${offenders.length} anti-patterns`);
      process.exitCode = 1;
    }
  }
}
