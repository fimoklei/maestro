#!/usr/bin/env node
// Runs lint, typecheck and tests as three separate processes, one after the
// other, and prints one summary. Separate processes are the point: chaining
// them with `&&` hides the later results behind the first failure.

import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { stripAnsi } from "./lib/log-file.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const logDir = resolve(repoRoot, ".logs");

const steps = [
  { name: "lint", command: "pnpm", args: ["lint"], log: "lint.log" },
  {
    name: "typecheck",
    command: "pnpm",
    args: ["typecheck"],
    log: "typecheck.log",
  },
  // `pnpm test` already tees into .logs/test.log via run-tests.mjs.
  {
    name: "test",
    command: "pnpm",
    args: ["test"],
    log: "test.log",
    writesOwnLog: true,
  },
];

const runStep = (step) =>
  new Promise((done) => {
    const logPath = resolve(logDir, step.log);
    const log = step.writesOwnLog
      ? null
      : createWriteStream(logPath, { flags: "w" });

    log?.write(`command: ${step.command} ${step.args.join(" ")}\n`);
    log?.write(`started: ${new Date().toISOString()}\n---\n`);

    // pnpm is a .cmd shim on Windows; spawn can't launch that without a shell.
    const child = spawn(step.command, step.args, {
      cwd: repoRoot,
      env: { ...process.env, FORCE_COLOR: "1" },
      stdio: ["inherit", "pipe", "pipe"],
      shell: process.platform === "win32",
    });

    const tee = (source, sink) => {
      source.on("data", (chunk) => {
        sink.write(chunk);
        log?.write(stripAnsi(chunk.toString()));
      });
    };

    tee(child.stdout, process.stdout);
    tee(child.stderr, process.stderr);

    child.on("error", (error) => {
      process.stderr.write(`failed to start ${step.name}: ${error.message}\n`);
      log?.end(`\n---\nfailed to start: ${error.message}\n`);
      done({ ...step, logPath, exitCode: 1 });
    });

    child.on("close", (code) => {
      const exitCode = code ?? 1;
      const tail = `---\nfinished: ${new Date().toISOString()}\nexit code: ${exitCode}\n`;
      if (log) log.end(tail, () => done({ ...step, logPath, exitCode }));
      else done({ ...step, logPath, exitCode });
    });
  });

mkdirSync(logDir, { recursive: true });

const results = [];
for (const step of steps) {
  process.stdout.write(`\n=== ${step.name} ===\n`);
  results.push(await runStep(step));
}

process.stdout.write("\n=== verify ===\n");
for (const result of results) {
  const passed = result.exitCode === 0;
  const mark = passed ? "PASS" : "FAIL";
  const where = passed ? "" : `  → .logs/${result.log}`;
  process.stdout.write(`  ${mark}  ${result.name}${where}\n`);
}

const failed = results.filter((result) => result.exitCode !== 0);
process.exit(failed.length === 0 ? 0 : 1);
