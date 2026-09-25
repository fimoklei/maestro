#!/usr/bin/env node
// Runs vitest and keeps the complete output on disk in `.logs/`.

import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { changedFiles } from "./lib/changed-files.mjs";
import { stripAnsi } from "./lib/log-file.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const logPath = resolve(repoRoot, ".logs/test.log");
const flags = process.argv.slice(2);

// `--affected` runs only the tests the uncommitted work reaches, with the
// commit gate's selection (`vitest related --passWithNoTests`).
const affected = flags.includes("--affected");
const rest = flags.filter((flag) => flag !== "--affected");
const args = affected
  ? [
      "related",
      "--run",
      "--passWithNoTests",
      ...rest,
      ...changedFiles(repoRoot),
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

const tee = (source, sink) => {
  source.on("data", (chunk) => {
    sink.write(chunk);
    log.write(stripAnsi(chunk.toString()));
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
