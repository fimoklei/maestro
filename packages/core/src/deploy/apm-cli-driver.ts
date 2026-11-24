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

const WIDE_COLUMNS = "200";

const APM_AUTH_PHRASES = ["authentication failed", "no token available"];

const INSTALL_SUCCESS_MARKERS = [
  /installed \d+ apm dependenc/,
  /no changes -- install state already up to date/,
];

const INSTALL_FAILURE_PHRASE = "installation failed";

const INSTALL_SYMLINK_PHRASE = "is a symlink";

const UNINSTALL_SUCCESS_MARKER = /uninstall complete: removed \d+ package\(s\)/;

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
  options: { cwd?: string; env?: NodeJS.ProcessEnv; signal: AbortSignal },
) => Promise<{ stdout: string; stderr: string }>;

const READ_TIMEOUT_MS = 60_000;
const WRITE_TIMEOUT_MS = 300_000;

class ApmTimedOut extends Error {}

export class ApmCliDriver implements ApmDriverPort {
  private readonly log: (entry: SanitizedLogEntry) => void;
  private readonly run: RunFn;
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
      ({ stdout } = await this.runApm(
        ["view", ownerRepo, "versions"],
        {},
        READ_TIMEOUT_MS,
      ));
    } catch (error) {
      return {
        ok: false,
        reason:
          error instanceof ApmTimedOut
            ? "timed-out"
            : hasAuthPhrase(error)
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
      const { stdout, stderr } = await this.runApm(
        args,
        { cwd },
        WRITE_TIMEOUT_MS,
      );
      output = `${stdout}\n${stderr}`;
    } catch (error) {
      if (error instanceof ApmTimedOut) {
        return { ok: false, reason: "timed-out" };
      }
      return { ok: false, reason: classifyInstallFailure(outputOf(error)) };
    }
    if (!installSucceeded(output)) {
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
    let output: string;
    try {
      const { stdout, stderr } = await this.runApm(
        args,
        { cwd },
        WRITE_TIMEOUT_MS,
      );
      output = `${stdout}\n${stderr}`;
    } catch (error) {
      if (error instanceof ApmTimedOut) {
        return { ok: false, reason: "timed-out" };
      }
      output = outputOf(error);
    }
    if (!removeSucceeded(output)) {
      return { ok: false };
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
    try {
      const { stdout } = await this.runApm(
        args,
        { cwd, env: { ...process.env, COLUMNS: WIDE_COLUMNS } },
        READ_TIMEOUT_MS,
      );
      this.log({
        operation: "check-outdated",
        target: target.kind === "repo" ? basename(target.repoPath) : "global",
        exitCode: 0,
        durationMs: Date.now() - started,
      });
      return parseOutdated(stdout);
    } catch (error) {
      return error instanceof ApmTimedOut
        ? { ok: false, reason: "timed-out" }
        : { ok: false };
    }
  }

  private async runApm(
    args: string[],
    options: { cwd?: string; env?: NodeJS.ProcessEnv },
    timeoutMs: number,
  ): Promise<{ stdout: string; stderr: string }> {
    const controller = new AbortController();
    const timedOut = new Promise<never>((_, reject) => {
      controller.signal.addEventListener("abort", () =>
        reject(new ApmTimedOut()),
      );
    });
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await Promise.race([
        this.run("apm", args, { ...options, signal: controller.signal }),
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
    !haystack.includes(INSTALL_FAILURE_PHRASE)
  );
}

function removeSucceeded(output: string): boolean {
  const haystack = normalizeCommandOutput(output);
  return (
    UNINSTALL_SUCCESS_MARKER.test(haystack) &&
    !UNINSTALL_NOT_FOUND_SIGNALS.some((signal) => signal.test(haystack))
  );
}

function classifyInstallFailure(
  output: string,
): "destination-symlinked" | "failed" {
  return normalizeCommandOutput(output).includes(INSTALL_SYMLINK_PHRASE)
    ? "destination-symlinked"
    : "failed";
}

function outputOf(error: unknown): string {
  return `${streamOf(error, "stdout")}\n${streamOf(error, "stderr")}`;
}

function streamOf(error: unknown, stream: "stdout" | "stderr"): string {
  if (typeof error !== "object" || error === null || !(stream in error)) {
    return "";
  }
  const value: unknown = Reflect.get(error, stream);
  return String(value ?? "");
}

function hasAuthPhrase(error: unknown): boolean {
  const haystack = normalizeCommandOutput(outputOf(error));
  return APM_AUTH_PHRASES.some((phrase) => haystack.includes(phrase));
}
