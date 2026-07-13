// Adapter: drive the real apm CLI. Implements ApmDriverPort with execFile and
// an args array — refs and paths are data, never command text (security.md).
// Raw apm stdout/stderr is never logged (it may contain tokens); only
// sanitized structured metadata leaves this module. Covered by the env-gated
// real-apm canary integration test, not the fast loop (apm needs network).
import { execFile } from "node:child_process";
import { basename } from "node:path";
import { promisify } from "node:util";
import { type OutdatedResult, parseOutdated } from "../drift/parse-outdated";
import type {
  ApmDriverPort,
  DeployTarget,
  ResolveLatestTagResult,
} from "./deploy-skill";
import { APM_DEPLOY_TARGET_FLAG } from "./deploy-tools";
import { resolveLatestTagFromVersionsTable } from "./latest-tag";

const defaultRun = promisify(execFile);

// Rich truncates the Package column to terminal width; a narrow run drops the
// skill name. Pin a wide non-TTY width so the full owner/repo/skills/<name>
// survives for the parser (apm-driver.md).
const WIDE_COLUMNS = "200";

// apm's own fixed phrases when GitHub auth is missing or expired, matched
// case-insensitively; either one classifies auth-required. We match only these
// two — never the git passthrough line or the env hints — and never echo the
// matched text (security.md, #119). Auth-only scope: a network/host error stays
// the generic failure.
const APM_AUTH_PHRASES = ["authentication failed", "no token available"];

// The positive marker apm prints on a successful install (`Installed N APM
// dependency`). Its presence — not the exit code — proves the install happened:
// apm exits 0 even when every probe fails and nothing is written (#119).
const INSTALL_SUCCESS_MARKER = /Installed \d+ APM dependenc/;

type SanitizedLogEntry = {
  operation: "resolve-latest-tag" | "deploy-skill" | "check-outdated";
  target: string;
  exitCode: number;
  durationMs: number;
};

// The process runner, injectable so command construction can be unit-tested
// without spawning apm. Production uses promisify(execFile).
type RunFn = (
  file: string,
  args: string[],
  options?: { cwd?: string; env?: NodeJS.ProcessEnv },
) => Promise<{ stdout: string; stderr: string }>;

export class ApmCliDriver implements ApmDriverPort {
  private readonly log: (entry: SanitizedLogEntry) => void;
  private readonly run: RunFn;
  // Resolves (creating if needed) the neutral cwd for a global install. apm
  // appends apm_modules/ to the cwd's .gitignore even for -g, so this must be
  // a scratch dir, never a real repo (apm-driver.md, J07).
  private readonly prepareGlobalCwd: () => Promise<string>;

  constructor(deps?: {
    log?: (entry: SanitizedLogEntry) => void;
    run?: RunFn;
    prepareGlobalCwd?: () => Promise<string>;
  }) {
    this.log = deps?.log ?? (() => undefined);
    this.run = deps?.run ?? defaultRun;
    this.prepareGlobalCwd =
      deps?.prepareGlobalCwd ??
      (() => {
        throw new Error("global deploy requires a prepareGlobalCwd resolver");
      });
  }

  async resolveLatestTag(ownerRepo: string): Promise<ResolveLatestTagResult> {
    const started = Date.now();
    let stdout: string;
    try {
      ({ stdout } = await this.run("apm", ["view", ownerRepo, "versions"]));
    } catch (error) {
      // apm exits non-zero here. Classify auth on the fixed phrases; anything
      // else is the generic failure. The raw error (which may carry a token in a
      // git URL) is never logged or returned — only the sanitized reason.
      return {
        ok: false,
        reason: hasAuthPhrase(error) ? "auth-required" : "failed",
      };
    }
    this.log({
      operation: "resolve-latest-tag",
      target: ownerRepo,
      exitCode: 0,
      durationMs: Date.now() - started,
    });
    const tag = resolveLatestTagFromVersionsTable(stdout);
    return tag === null ? { ok: false, reason: "no-tag" } : { ok: true, tag };
  }

  async deploySkill(input: {
    target: DeployTarget;
    ref: string;
  }): Promise<void> {
    const started = Date.now();
    // One action targets both tools (-t claude,codex). apm writes a single
    // lockfile entry with two deployed_files; see apm-driver.md (01.2 spike).
    // A global install adds -g and runs from a neutral scratch cwd.
    const { cwd, args, logTarget } = await this.commandFor(
      input.target,
      input.ref,
    );
    const { stdout } = await this.run("apm", args, { cwd });
    // Fail-closed: apm install exits 0 even when the install fails, so trust the
    // positive marker, not the exit code. An absent marker (or any unrecognised
    // output) reads as failure — never a false success (#119). The raw output,
    // which may carry a token, is deliberately not included in the error.
    if (!INSTALL_SUCCESS_MARKER.test(stdout)) {
      throw new Error("apm install did not report a completed installation");
    }
    this.log({
      operation: "deploy-skill",
      // Repo basename or "global" — never the full path or raw apm output.
      target: logTarget,
      exitCode: 0,
      durationMs: Date.now() - started,
    });
  }

  async checkOutdated(target: DeployTarget): Promise<OutdatedResult> {
    const started = Date.now();
    const cwd =
      target.kind === "repo" ? target.repoPath : await this.prepareGlobalCwd();
    const args = target.kind === "repo" ? ["outdated"] : ["outdated", "-g"];
    try {
      const { stdout } = await this.run("apm", args, {
        cwd,
        env: { ...process.env, COLUMNS: WIDE_COLUMNS },
      });
      this.log({
        operation: "check-outdated",
        target: target.kind === "repo" ? basename(target.repoPath) : "global",
        exitCode: 0,
        durationMs: Date.now() - started,
      });
      // The run succeeded; the parser still owns whether the output is a
      // recognised shape — an unrecognised table reads as { ok: false }, never
      // a false empty behind set.
      return parseOutdated(stdout);
    } catch {
      // CLI missing, no auth/network, or a non-zero exit — a flat failure. The
      // raw apm error (which may carry a token) is deliberately not logged.
      return { ok: false };
    }
  }

  private async commandFor(
    target: DeployTarget,
    ref: string,
  ): Promise<{ cwd: string; args: string[]; logTarget: string }> {
    if (target.kind === "repo") {
      return {
        cwd: target.repoPath,
        args: ["install", ref, "-t", APM_DEPLOY_TARGET_FLAG],
        logTarget: basename(target.repoPath),
      };
    }
    return {
      cwd: await this.prepareGlobalCwd(),
      args: ["install", ref, "-g", "-t", APM_DEPLOY_TARGET_FLAG],
      logTarget: "global",
    };
  }
}

// True when a rejected apm run carries one of apm's fixed auth phrases on its
// stdout or stderr. promisify(execFile) rejects with an error carrying both.
// Case-insensitive; the raw text is inspected here and never leaves this scope.
function hasAuthPhrase(error: unknown): boolean {
  const { stdout, stderr } = error as { stdout?: unknown; stderr?: unknown };
  const haystack =
    `${String(stdout ?? "")}\n${String(stderr ?? "")}`.toLowerCase();
  return APM_AUTH_PHRASES.some((phrase) => haystack.includes(phrase));
}
