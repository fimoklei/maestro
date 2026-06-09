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

const run = promisify(execFile);

type SanitizedLogEntry = {
  operation: "resolve-latest-tag" | "deploy-skill";
  target: string;
  exitCode: number;
  durationMs: number;
};

export class ApmCliDriver implements ApmDriverPort {
  private readonly log: (entry: SanitizedLogEntry) => void;

  constructor(deps?: { log?: (entry: SanitizedLogEntry) => void }) {
    this.log = deps?.log ?? (() => undefined);
  }

  async resolveLatestTag(ownerRepo: string): Promise<string | null> {
    const started = Date.now();
    const { stdout } = await run("apm", ["view", ownerRepo, "versions"]);
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
    await run("apm", ["install", input.ref, "-t", "claude"], {
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
