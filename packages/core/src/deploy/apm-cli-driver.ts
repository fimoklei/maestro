// Raw apm stdout/stderr never leaves this module: it may carry tokens.
import { execFile } from "node:child_process";
import { basename } from "node:path";
import { promisify } from "node:util";
import { type OutdatedResult, parseOutdated } from "../drift/parse-outdated";
import { normalizeCommandOutput } from "../normalize-command-output";
import type {
  ApmDriverPort,
  DeploySkillDriverResult,
  DeployTarget,
  RemoveSkillDriverResult,
  ResolveLatestTagResult,
} from "./deploy-skill";
import {
  APM_DEPLOY_TARGET_FLAG,
  apmTargetFlagForTools,
  type SupportedTool,
} from "./deploy-tools";
import { resolveLatestTagFromVersionsTable } from "./latest-tag";

const defaultRun = promisify(execFile);

// A narrow terminal truncates the Package column and drops the skill name.
const WIDE_COLUMNS = "200";

// These two phrases only, never the git passthrough line, and never echoed (#119).
const APM_AUTH_PHRASES = ["authentication failed", "no token available"];

// Match phrases against normalized output: apm wraps lines mid-sentence.
// The second marker is a no-op re-deploy, not a failure.
const INSTALL_SUCCESS_MARKERS = [
  /installed \d+ apm dependenc/,
  /no changes -- install state already up to date/,
];

// Guards older apm output that printed the marker beside errors (#180).
// `[1-9]\d*` so `with 0 error(s)` stays a success.
const INSTALL_FAILURE_SIGNALS = [
  /with [1-9]\d* error\(s\)/,
  /installation failed/,
];

const INSTALL_SYMLINK_PHRASE = "is a symlink";

const UNINSTALL_SUCCESS_MARKER = /uninstall complete: removed \d+ package\(s\)/;

// Read alongside the success marker, never instead of it: a run printing both
// removed something and missed something.
const UNINSTALL_NOT_FOUND_SIGNALS = [
  /- not found in apm\.yml/,
  /were not found in apm\.yml/,
];

type SanitizedLogEntry = {
  operation:
    | "resolve-latest-tag"
    | "deploy-skill"
    | "remove-skill"
    | "check-outdated";
  target: string;
  exitCode: number;
  durationMs: number;
};

type RunFn = (
  file: string,
  args: string[],
  options?: { cwd?: string; env?: NodeJS.ProcessEnv },
) => Promise<{ stdout: string; stderr: string }>;

export class ApmCliDriver implements ApmDriverPort {
  private readonly log: (entry: SanitizedLogEntry) => void;
  private readonly run: RunFn;
  // apm edits the cwd's .gitignore even for -g: resolve a scratch dir, never a repo.
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
      // The raw error may carry a token in a git URL: only the reason leaves.
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
    skills?: readonly string[];
    tools?: readonly SupportedTool[];
  }): Promise<DeploySkillDriverResult> {
    const started = Date.now();
    const { cwd, args, logTarget } = await this.commandFor(
      input.target,
      input.ref,
      input.tools,
      input.skills,
    );
    let output: string;
    try {
      const { stdout, stderr } = await this.run("apm", args, { cwd });
      output = `${stdout}\n${stderr}`;
    } catch (error) {
      // Classify from the rejected run's own output, not the exit code (#183).
      return { ok: false, reason: classifyInstallFailure(outputOf(error)) };
    }
    // Fail-closed: an exit-0 run still has to prove itself with the marker.
    if (!installSucceeded(output)) {
      return { ok: false, reason: classifyInstallFailure(output) };
    }
    this.log({
      operation: "deploy-skill",
      // Basename or "global", never the full path.
      target: logTarget,
      exitCode: 0,
      durationMs: Date.now() - started,
    });
    return { ok: true };
  }

  async removeSkill(input: {
    target: DeployTarget;
    ref: string;
  }): Promise<RemoveSkillDriverResult> {
    const started = Date.now();
    // uninstall has no -t; narrowing `targets:` to fake one orphans other tools' files.
    const target = input.target;
    const cwd =
      target.kind === "repo" ? target.repoPath : await this.prepareGlobalCwd();
    const args =
      target.kind === "repo"
        ? ["uninstall", input.ref]
        : ["uninstall", input.ref, "-g"];
    const logTarget =
      target.kind === "repo" ? basename(target.repoPath) : "global";
    let output: string;
    try {
      const { stdout, stderr } = await this.run("apm", args, { cwd });
      output = `${stdout}\n${stderr}`;
    } catch (error) {
      output = outputOf(error);
    }
    if (!removeSucceeded(output)) {
      return { ok: false };
    }
    this.log({
      operation: "remove-skill",
      // Basename or "global", never the full path.
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
      return parseOutdated(stdout);
    } catch {
      // Not logged: the raw apm error may carry a token.
      return { ok: false };
    }
  }

  private async commandFor(
    target: DeployTarget,
    ref: string,
    tools?: readonly SupportedTool[],
    skills?: readonly string[],
  ): Promise<{ cwd: string; args: string[]; logTarget: string }> {
    // One `--skill` per name, never a comma list. The flag adds to the
    // persisted Selection; it never replaces it.
    const selection = (skills ?? []).flatMap((name) => ["--skill", name]);
    if (target.kind === "repo") {
      // `tools` is ignored: a repo always targets every DEPLOY_TOOLS tool (#131).
      return {
        cwd: target.repoPath,
        args: ["install", ref, ...selection, "-t", APM_DEPLOY_TARGET_FLAG],
        logTarget: basename(target.repoPath),
      };
    }
    if (!tools || tools.length === 0) {
      throw new Error("global install requires at least one detected tool");
    }
    return {
      cwd: await this.prepareGlobalCwd(),
      args: [
        "install",
        ref,
        ...selection,
        "-g",
        "-t",
        apmTargetFlagForTools(tools),
      ],
      logTarget: "global",
    };
  }
}

function installSucceeded(output: string): boolean {
  const haystack = normalizeCommandOutput(output);
  return (
    INSTALL_SUCCESS_MARKERS.some((marker) => marker.test(haystack)) &&
    !INSTALL_FAILURE_SIGNALS.some((signal) => signal.test(haystack))
  );
}

function removeSucceeded(output: string): boolean {
  const haystack = normalizeCommandOutput(output);
  return (
    UNINSTALL_SUCCESS_MARKER.test(haystack) &&
    !UNINSTALL_NOT_FOUND_SIGNALS.some((signal) => signal.test(haystack))
  );
}

// Only the symlink refusal is classified, so an unknown message never passes
// as a diagnosed one (#180).
function classifyInstallFailure(
  output: string,
): "destination-symlinked" | "failed" {
  return normalizeCommandOutput(output).includes(INSTALL_SYMLINK_PHRASE)
    ? "destination-symlinked"
    : "failed";
}

function outputOf(error: unknown): string {
  const { stdout, stderr } = error as { stdout?: unknown; stderr?: unknown };
  return `${String(stdout ?? "")}\n${String(stderr ?? "")}`;
}

// The raw text is inspected here and never leaves this scope.
function hasAuthPhrase(error: unknown): boolean {
  const haystack = normalizeCommandOutput(outputOf(error));
  return APM_AUTH_PHRASES.some((phrase) => haystack.includes(phrase));
}
