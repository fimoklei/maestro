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
  DeploySkillDriverResult,
  DeployTarget,
  ResolveLatestTagResult,
} from "./deploy-skill";
import {
  APM_DEPLOY_TARGET_FLAG,
  apmTargetFlagForTools,
  type SupportedTool,
} from "./deploy-tools";
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
// the generic failure (apm-driver.md).
const APM_AUTH_PHRASES = ["authentication failed", "no token available"];

// The positive marker apm prints on a successful install (`Installed N APM
// dependency`). Its presence — not the exit code — proves the install happened:
// apm exits 0 even when every probe fails and nothing is written (#119,
// apm-driver.md).
const INSTALL_SUCCESS_MARKER = /Installed \d+ APM dependenc/;

// apm's fixed failure signals on an install. The marker alone is not enough: on
// 0.20.0 a refused install prints `Installed 1 APM dependency ... with 1
// error(s)`, so the marker without this check reads a refusal as a success
// (#180). `Installation failed` is the 0.25.0 shape, which prints no marker at
// all (docs/research/apm-0.25-symlink-topology-impact.md). `[1-9]\d*`, not
// `\d+`: a `with 0 error(s)` summary must not turn a genuine success into a
// failure.
const INSTALL_FAILURE_SIGNALS = [
  /with [1-9]\d* error\(s\)/i,
  /installation failed/i,
];

// apm's fixed refusal phrase when the skill destination is a symlink. apm
// refuses only a symlink at the leaf skill directory; a directory-level symlink
// one level up installs fine, which is the fix the cockpit points the user at
// (#180). Matched case-insensitively against whitespace-normalized output —
// Rich wraps the phrase across a line break at narrow widths.
const INSTALL_SYMLINK_PHRASE = "is a symlink";

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
    tools?: readonly SupportedTool[];
  }): Promise<DeploySkillDriverResult> {
    const started = Date.now();
    // A repo install targets every tool (-t claude,codex) and writes a single
    // lockfile entry with two deployed_files (apm-driver.md, 01.2 spike). A
    // global install adds -g, runs from a neutral scratch cwd, and scopes -t to
    // the tools the caller detected on the machine (ADR-0011, #131).
    const { cwd, args, logTarget } = await this.commandFor(
      input.target,
      input.ref,
      input.tools,
    );
    let output: string;
    try {
      const { stdout, stderr } = await this.run("apm", args, { cwd });
      output = `${stdout}\n${stderr}`;
    } catch (error) {
      // apm exits non-zero on a refused install (0.20.0 symlink refusal, every
      // 0.25.0 failure). Classify from the rejected run's own output.
      return { ok: false, reason: classifyInstallFailure(outputOf(error)) };
    }
    // Fail-closed: apm install exits 0 even when the install fails, so trust the
    // positive marker, not the exit code — and only when no failure signal rides
    // along with it (#119, #180, apm-driver.md). The raw output, which may carry
    // a token, never leaves this scope.
    if (!installSucceeded(output)) {
      return { ok: false, reason: classifyInstallFailure(output) };
    }
    this.log({
      operation: "deploy-skill",
      // Repo basename or "global" — never the full path or raw apm output.
      target: logTarget,
      exitCode: 0,
      durationMs: Date.now() - started,
    });
    return { ok: true };
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
    tools?: readonly SupportedTool[],
  ): Promise<{ cwd: string; args: string[]; logTarget: string }> {
    if (target.kind === "repo") {
      // The repo path is unaffected by presence scoping: it always targets every
      // DEPLOY_TOOLS tool, so a stray `tools` value here is deliberately ignored.
      return {
        cwd: target.repoPath,
        args: ["install", ref, "-t", APM_DEPLOY_TARGET_FLAG],
        logTarget: basename(target.repoPath),
      };
    }
    // Global: scope -t to exactly the detected tools. Fail closed on an
    // empty/absent set rather than defaulting to every tool — targeting a tool
    // the machine lacks writes the dead .agents/ tree ADR-0011 exists to prevent
    // (#131). DeploySkill already refuses a tool-less machine upstream, so this
    // only bites a driver misuse, and it bites loudly instead of silently.
    if (!tools || tools.length === 0) {
      throw new Error("global install requires at least one detected tool");
    }
    return {
      cwd: await this.prepareGlobalCwd(),
      args: ["install", ref, "-g", "-t", apmTargetFlagForTools(tools)],
      logTarget: "global",
    };
  }
}

// An install succeeded only when apm printed its positive marker AND no failure
// signal. Either condition alone misreads one of apm's two lying shapes: an
// exit-0 failure with no marker, or a refusal that prints the marker anyway.
function installSucceeded(output: string): boolean {
  return (
    INSTALL_SUCCESS_MARKER.test(output) &&
    !INSTALL_FAILURE_SIGNALS.some((signal) => signal.test(output))
  );
}

// Classify a failed install on apm's fixed phrases. Only the symlink refusal is
// classified; every other failure stays generic, so an unrecognised message can
// never masquerade as a diagnosed one (fail-closed). The inspected text never
// leaves this scope (security.md).
function classifyInstallFailure(
  output: string,
): "destination-symlinked" | "failed" {
  return normalize(output).includes(INSTALL_SYMLINK_PHRASE)
    ? "destination-symlinked"
    : "failed";
}

// Lowercase and collapse every whitespace run to a single space, so a phrase
// Rich wrapped across a line break still matches.
function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ");
}

// stdout + stderr of a rejected run. promisify(execFile) rejects with an error
// carrying both.
function outputOf(error: unknown): string {
  const { stdout, stderr } = error as { stdout?: unknown; stderr?: unknown };
  return `${String(stdout ?? "")}\n${String(stderr ?? "")}`;
}

// True when a rejected apm run carries one of apm's fixed auth phrases on its
// stdout or stderr. promisify(execFile) rejects with an error carrying both.
// Case-insensitive; the raw text is inspected here and never leaves this scope.
function hasAuthPhrase(error: unknown): boolean {
  const haystack = normalize(outputOf(error));
  return APM_AUTH_PHRASES.some((phrase) => haystack.includes(phrase));
}
