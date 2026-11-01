#!/usr/bin/env node
// Runs vitest and keeps the complete output on disk in `.logs/`.

import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { stripVTControlCharacters } from "node:util";

import { changedFiles } from "./lib/changed-files.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const logPath = resolve(repoRoot, ".logs/test.log");
const flags = process.argv.slice(2);

// `--affected` runs only the tests the uncommitted work reaches, with the
// commit gate's selection (`vitest related --passWithNoTests`). `--since <ref>`
// widens the work to everything the branch changed since `ref`.
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
if (affected) {
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
const args = affected
  ? ["related", "--run", "--passWithNoTests", ...rest, ...changed]
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

const tee = (source, sink) => {
  source.on("data", (chunk) => {
    sink.write(chunk);
    log.write(stripVTControlCharacters(chunk.toString()));
  });
};

tee(child.stdout, process.stdout);
tee(child.stderr, process.stderr);

child.on("error", (error) => {
  process.stderr.write(`failed to start vitest: ${error.message}\n`);
  log.end(`\n---\nfailed to start vitest: ${error.message}\n`, () =>
    process.exit(1),
  );
});

child.on("close", (code, signal) => {
  const exitCode = code ?? 1;
  log.end(
    `---\nfinished: ${new Date().toISOString()}\nexit code: ${exitCode}${signal ? ` (signal ${signal})` : ""}\n`,
    () => process.exit(exitCode),
  );
});
