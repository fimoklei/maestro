import { basename } from "node:path";
import { type OutdatedResult, parseOutdated } from "../drift/parse-outdated";
import { normalizeCommandOutput } from "../normalize-command-output";
import {
  createProcessRunner,
  type ProcessOutcome,
  type ProcessRunner,
  type RunFn,
  runProcess,
} from "../process/run-process";
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
  CLAUDE_CONFIG_VARIABLE,
  type SupportedTool,
} from "./deploy-tools";
import type { FormerClaudeProfile } from "./former-claude-folders";
import { resolveLatestTagFromVersionsTable } from "./latest-tag";

const WIDE_COLUMNS = "200";

const APM_AUTH_PHRASES = ["authentication failed", "no token available"];

const INSTALL_SUCCESS_MARKERS = [
  /installed \d+ apm dependenc/,
  /cleaned \d+ stale files?\b/,
  /updated apm\.lock\.yaml/,
  /no changes -- install state already up to date/,
];

const INSTALL_FAILURE_SIGNALS = [
  /installation failed/,
  /install failed after/,
  /with \d+ error\(s\)/,
  /some requested packages were skipped/,
];

const LINKED_DESTINATION_PHRASES = [
  "unsafe skill destination",
  "refusing deployment through a symlinked path component",
];

const UNINSTALL_LINKED_PHRASE =
  "uninstall stopped: apm.lock.yaml records paths apm does not manage";

const UNINSTALL_SUCCESS_MARKER = /uninstall complete: removed \d+ packages?\b/;

const UNINSTALL_SELECTED_PROFILE_ONLY = /from the selected profile only/;

const UNINSTALL_INCOMPLETE_SIGNALS = [
  /was not found in apm\.yml/,
  UNINSTALL_SELECTED_PROFILE_ONLY,
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

const READ_TIMEOUT_MS = 60_000;
const WRITE_TIMEOUT_MS = 300_000;

const TIMED_OUT: ProcessOutcome = {
  ok: false,
  failure: "killed",
  stdout: "",
  stderr: "",
};

export class ApmCliDriver implements ApmDriverPort {
  private readonly log: (entry: SanitizedLogEntry) => void;
  private readonly run: ProcessRunner;
  private readonly prepareGlobalCwd: () => Promise<string>;
  private readonly formerClaudeProfiles: () => Promise<
    readonly FormerClaudeProfile[]
  >;

  constructor(deps?: {
    log?: (entry: SanitizedLogEntry) => void;
    run?: RunFn;
    prepareGlobalCwd?: () => Promise<string>;
    formerClaudeProfiles?: () => Promise<readonly FormerClaudeProfile[]>;
  }) {
    this.log = deps?.log ?? (() => undefined);
    this.run = deps?.run ? createProcessRunner(deps.run) : runProcess;
    this.prepareGlobalCwd =
      deps?.prepareGlobalCwd ??
      (() => {
        throw new Error("global deploy requires a prepareGlobalCwd resolver");
      });
    this.formerClaudeProfiles =
      deps?.formerClaudeProfiles ??
      (() => {
        throw new Error("global remove requires a formerClaudeProfiles reader");
      });
  }

  async resolveLatestTag(ownerRepo: string): Promise<ResolveLatestTagResult> {
    const started = Date.now();
    const outcome = await this.runApm(
      ["view", ownerRepo, "versions"],
      {},
      READ_TIMEOUT_MS,
    );
    if (!outcome.ok) {
      return {
        ok: false,
        reason:
          outcome.failure === "killed"
            ? "timed-out"
            : hasAuthPhrase(outcome)
              ? "auth-required"
              : "failed",
      };
    }
    this.log({
      operation: "resolve-latest-tag",
      target: ownerRepo,
      exitCode: 0,
      durationMs: Date.now() - started,
    });
    const tag = resolveLatestTagFromVersionsTable(outcome.stdout);
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
    const outcome = await this.runApm(args, { cwd }, WRITE_TIMEOUT_MS);
    if (!outcome.ok && outcome.failure === "killed") {
      return { ok: false, reason: "timed-out" };
    }
    const output = outputOf(outcome);
    if (!outcome.ok || !installSucceeded(output)) {
      return { ok: false, reason: classifyInstallFailure(output) };
    }
    this.log({
      operation: "deploy-skill",
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
    const target = input.target;
    const cwd =
      target.kind === "repo" ? target.repoPath : await this.prepareGlobalCwd();
    const args =
      target.kind === "repo"
        ? ["uninstall", input.ref]
        : ["uninstall", input.ref, "-g"];
    const logTarget =
      target.kind === "repo" ? basename(target.repoPath) : "global";
    let outcome = await this.runApm(args, { cwd }, WRITE_TIMEOUT_MS);
    if (target.kind === "global" && removedSelectedProfileOnly(outcome)) {
      for (const profile of await this.formerClaudeProfiles()) {
        outcome = await this.runApm(
          args,
          { cwd, env: claudeProfileEnv(profile) },
          WRITE_TIMEOUT_MS,
        );
        if (!removedSelectedProfileOnly(outcome)) {
          break;
        }
      }
    }
    if (!outcome.ok && outcome.failure === "killed") {
      return { ok: false, reason: "timed-out" };
    }
    const output = outputOf(outcome);
    if (!removeSucceeded(output)) {
      return normalizeCommandOutput(output).includes(UNINSTALL_LINKED_PHRASE)
        ? { ok: false, reason: "destination-symlinked" }
        : { ok: false };
    }
    this.log({
      operation: "remove-skill",
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
    const outcome = await this.runApm(
      args,
      { cwd, env: { ...process.env, COLUMNS: WIDE_COLUMNS } },
      READ_TIMEOUT_MS,
    );
    if (!outcome.ok) {
      return outcome.failure === "killed"
        ? { ok: false, reason: "timed-out" }
        : { ok: false };
    }
    this.log({
      operation: "check-outdated",
      target: target.kind === "repo" ? basename(target.repoPath) : "global",
      exitCode: 0,
      durationMs: Date.now() - started,
    });
    return parseOutdated(outcome.stdout);
  }

  private async runApm(
    args: string[],
    options: { cwd?: string; env?: NodeJS.ProcessEnv },
    timeoutMs: number,
  ): Promise<ProcessOutcome> {
    const controller = new AbortController();
    const timedOut = new Promise<ProcessOutcome>((resolve) => {
      controller.signal.addEventListener("abort", () => resolve(TIMED_OUT));
    });
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await Promise.race([
        this.run("apm", args, {
          env: process.env,
          timeout: 0,
          ...options,
          signal: controller.signal,
        }),
        timedOut,
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  private async commandFor(
    target: DeployTarget,
    ref: string,
    tools?: readonly SupportedTool[],
    skills?: readonly string[],
  ): Promise<{ cwd: string; args: string[]; logTarget: string }> {
    const selection = (skills ?? []).flatMap((name) => ["--skill", name]);
    if (target.kind === "repo") {
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
    !UNINSTALL_INCOMPLETE_SIGNALS.some((signal) => signal.test(haystack))
  );
}

function removedSelectedProfileOnly(outcome: ProcessOutcome): boolean {
  return UNINSTALL_SELECTED_PROFILE_ONLY.test(
    normalizeCommandOutput(outputOf(outcome)),
  );
}

function claudeProfileEnv(profile: FormerClaudeProfile): NodeJS.ProcessEnv {
  const { [CLAUDE_CONFIG_VARIABLE]: _current, ...ambient } = process.env;
  return profile.configDir === null
    ? ambient
    : { ...ambient, [CLAUDE_CONFIG_VARIABLE]: profile.configDir };
}

function classifyInstallFailure(
  output: string,
): "destination-symlinked" | "failed" {
  const haystack = normalizeCommandOutput(output);
  return LINKED_DESTINATION_PHRASES.some((phrase) => haystack.includes(phrase))
    ? "destination-symlinked"
    : "failed";
}

function outputOf(outcome: ProcessOutcome): string {
  return `${outcome.stdout}\n${outcome.stderr}`;
}

function hasAuthPhrase(outcome: ProcessOutcome): boolean {
  const haystack = normalizeCommandOutput(outputOf(outcome));
  return APM_AUTH_PHRASES.some((phrase) => haystack.includes(phrase));
}
