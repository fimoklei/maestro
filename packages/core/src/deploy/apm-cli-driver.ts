// Adapter: drive the real apm CLI. Implements ApmDriverPort with execFile and
// an args array — refs and paths are data, never command text (security.md).
// Raw apm stdout/stderr is never logged (it may contain tokens); only
// sanitized structured metadata leaves this module. Covered by the env-gated
// real-apm canary integration test, not the fast loop (apm needs network).
import { execFile } from "node:child_process";
import { basename } from "node:path";
import { promisify } from "node:util";
import type { ApmDriverPort } from "./deploy-skill";
import { resolveLatestTagFromVersionsTable } from "./latest-tag";

const defaultRun = promisify(execFile);

type SanitizedLogEntry = {
  operation: "resolve-latest-tag" | "deploy-skill";
  target: string;
  exitCode: number;
  durationMs: number;
};

// The process runner, injectable so command construction can be unit-tested
// without spawning apm. Production uses promisify(execFile).
type RunFn = (
  file: string,
  args: string[],
  options?: { cwd?: string },
) => Promise<{ stdout: string; stderr: string }>;

export class ApmCliDriver implements ApmDriverPort {
  private readonly log: (entry: SanitizedLogEntry) => void;
  private readonly run: RunFn;

  constructor(deps?: {
    log?: (entry: SanitizedLogEntry) => void;
    run?: RunFn;
  }) {
    this.log = deps?.log ?? (() => undefined);
    this.run = deps?.run ?? defaultRun;
  }

  async resolveLatestTag(ownerRepo: string): Promise<string | null> {
    const started = Date.now();
    const { stdout } = await this.run("apm", ["view", ownerRepo, "versions"]);
    this.log({
      operation: "resolve-latest-tag",
      target: ownerRepo,
      exitCode: 0,
      durationMs: Date.now() - started,
    });
    return resolveLatestTagFromVersionsTable(stdout);
  }

  async deploySkill(input: { repoPath: string; ref: string }): Promise<void> {
    const started = Date.now();
    // One action targets both tools (-t claude,codex). apm writes a single
    // lockfile entry with two deployed_files; see apm-driver.md (01.2 spike).
    await this.run("apm", ["install", input.ref, "-t", "claude,codex"], {
      cwd: input.repoPath,
    });
    this.log({
      operation: "deploy-skill",
      // Repo basename only — never the full path or raw apm output.
      target: basename(input.repoPath),
      exitCode: 0,
      durationMs: Date.now() - started,
    });
  }
}
