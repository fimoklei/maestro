#!/usr/bin/env node
// Runs vitest and keeps the complete output on disk in `.logs/`.

import { execFileSync, spawn } from "node:child_process";
import { createWriteStream, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { stripVTControlCharacters } from "node:util";
import { changedFiles } from "./lib/changed-files.mjs";
import { idleWatch } from "./lib/idle-watch.mjs";
import { sourceScanTests } from "./lib/source-scan-tests.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const logPath = resolve(repoRoot, ".logs/test.log");
const argv = process.argv.slice(2);
const filesAt = argv.indexOf("--");
const flags = filesAt === -1 ? argv : argv.slice(0, filesAt);

// `--affected` runs only the tests the uncommitted work reaches: what
// `vitest related --passWithNoTests` finds, plus the tests that read a touched
// package's source from disk, which it misses. `--since <ref>` widens the work
// to everything the branch changed since `ref`. Files after `--` replace the
// uncommitted work: the commit gate passes its commit's files that way.
const given = filesAt === -1 ? null : argv.slice(filesAt + 1);
const affected = flags.includes("--affected");
const sinceAt = flags.indexOf("--since");
const since = sinceAt === -1 ? null : flags[sinceAt + 1];
if (since === undefined || (since !== null && !affected)) {
  process.stderr.write("--since takes a ref and needs --affected\n");
  process.exit(2);
}
const rest = flags.filter(
  (flag, index) =>
    flag !== "--affected" &&
    (sinceAt === -1 || index < sinceAt || index > sinceAt + 1),
);

let changed = [];
if (affected && given !== null) {
  changed = given;
  if (changed.length === 0) process.exit(0);
} else if (affected) {
  try {
    changed = changedFiles(repoRoot, since);
  } catch {
    process.stderr.write(`git could not compare against ${since}\n`);
    process.exit(2);
  }
  if (changed.length === 0) {
    process.stdout.write(
      since === null
        ? "No uncommitted changes, so no tests ran. For committed or merged work: pnpm test:affected --since origin/main\n"
        : `No changes since ${since}, so no tests ran.\n`,
    );
    process.exit(0);
  }
}
// Every package test, read once so a source-scan test joins the run.
const packageTests = () =>
  execFileSync(
    "git",
    ["ls-files", "-z", "packages/*/src/*.test.ts", "packages/*/src/*.test.tsx"],
    { cwd: repoRoot },
  )
    .toString()
    .split("\0")
    .filter(Boolean)
    .map((path) => ({
      path,
      text: readFileSync(resolve(repoRoot, path), "utf8"),
    }));

const args = affected
  ? [
      "related",
      "--run",
      "--passWithNoTests",
      ...rest,
      ...new Set([...changed, ...sourceScanTests(changed, packageTests())]),
    ]
  : ["run", ...rest];

mkdirSync(dirname(logPath), { recursive: true });
const log = createWriteStream(logPath, { flags: "w" });

const command = `vitest ${args.join(" ")}`;
log.write(`command: pnpm exec ${command}\n`);
log.write(`started: ${new Date().toISOString()}\n`);
log.write("---\n");

// Colour stays on screen; the file gets plain text so it greps cleanly.
const child = spawn("vitest", args, {
  cwd: repoRoot,
  env: { ...process.env, FORCE_COLOR: "1" },
  stdio: ["inherit", "pipe", "pipe"],
});

const STALL_MS = 180_000;
const watch = idleWatch({ limitMs: STALL_MS, startedAt: Date.now() });
const stallTimer = setInterval(() => {
  const idle = watch.check(Date.now());
  if (idle === null) return;
  const notice = `\n[run-tests] no output for ${Math.round(idle / 60_000)} min. Check for workers: pgrep -P ${child.pid}\n`;
  process.stderr.write(notice);
  log.write(notice);
}, 30_000);

const tee = (source, sink) => {
  source.on("data", (chunk) => {
    watch.output(Date.now());
    sink.write(chunk);
    log.write(stripVTControlCharacters(chunk.toString()));
  });
};

tee(child.stdout, process.stdout);
tee(child.stderr, process.stderr);

child.on("error", (error) => {
  clearInterval(stallTimer);
  process.stderr.write(`failed to start vitest: ${error.message}\n`);
  log.end(`\n---\nfailed to start vitest: ${error.message}\n`, () =>
    process.exit(1),
  );
});

child.on("close", (code, signal) => {
  clearInterval(stallTimer);
  const exitCode = code ?? 1;
  log.end(
    `---\nfinished: ${new Date().toISOString()}\nexit code: ${exitCode}${signal ? ` (signal ${signal})` : ""}\n`,
    () => process.exit(exitCode),
  );
});
