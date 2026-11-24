import { afterEach, describe, expect, it, vi } from "vitest";
import { ApmCliDriver } from "./apm-cli-driver";

type RunCall = { file: string; args: string[]; cwd?: string };

const INSTALL_OK_SUMMARY = "[*] Installed 1 APM dependency in 3.8s.";

const installOkOutputApm026 = [
  "[*] Created apm.yml",
  "[i] Targets set: claude (persisted to apm.yml)",
  "[*] Validating 1 package...",
  "[+] fimoklei/agent-harness/skills/tdd#v0.5.0",
  "[*] Updated apm.yml with 1 new package(s)",
  "[>] Installing 1 new package...",
  "[i] Targets: claude  (source: --target flag)",
  "  [+] github.com/fimoklei/agent-harness/skills/tdd#v0.5.0 #v0.5.0 @ec491f15",
  "  |-- Skill integrated -> .claude/skills/",
  "[i] Added apm_modules/ to .gitignore",
  "",
  INSTALL_OK_SUMMARY,
].join("\n");

const sameRefReinstallOutputApm026 = [
  "[*] Validating 1 package...",
  "[+] fimoklei/agent-harness/.apm/skills/47#v0.6.0 (already in apm.yml)",
  "[>] Installing 1 new package...",
  "[i] Targets: claude, codex  (source: --target flag)",
  "  [+] github.com/fimoklei/agent-harness/.apm/skills/47#v0.6.0 #v0.6.0 @f8208f12 (cached)",
  "  |-- (files unchanged)",
  "",
  "[i] No changes -- install state already up to date in 1.5s.",
].join("\n");

const batchUnknownSkillOutputApm029 = [
  "[>] Resolving fimoklei/agent-harness...",
  "[i] Targets: claude, codex  (source: --target flag)",
  "  [+] fimoklei/agent-harness #v0.6.0 @f8208f12",
  "[i] Removed apm.yml created by the failed install.",
  "  [x] 1 package failed:",
  "    +- fimoklei/agent-harness -- --skill did not match skills in ",
  "'fimoklei/agent-harness'. Requested: no-such-skill.",
  "[x] Installation failed with 1 error(s) in 2.5s. No install transaction changes ",
  "were committed.",
].join("\n");

const batchSymlinkSkippedOutputApm029 = [
  "  [+] fimoklei/agent-harness #v0.6.0 @f8208f12",
  "  |-- 2 skill(s) integrated -> .agents/skills/, .claude/skills/",
  "[i] Added apm_modules/ to .gitignore",
  "  [!] 1 file skipped -- local files exist, not managed by APM",
  "    Use 'apm install --force' to overwrite",
  "[*] Installed 1 APM dependency in 2.9s.",
].join("\n");

const installProbesFailedOutputApm026 = [
  "[*] Created apm.yml",
  "[i] Targets set: claude (persisted to apm.yml)",
  "[*] Validating 1 package...",
  "[x] github.com/fimoklei/agent-harness/skills/tdd#v0.5.0 -- all probes failed ",
  "(marker-file, Contents API, git ls-remote, shallow-fetch) -- verify the path and",
  "ref exist and that your credentials have read access (run with --verbose for the",
  "full probe log)",
  "All packages failed validation. Nothing to install.",
  "[i] Removed apm.yml created by the failed install.",
].join("\n");

const viewAuthFailedOutput = [
  "[x] Failed to list versions for 'fimoklei/agent-harness': Failed to list",
  "remote refs for fimoklei/agent-harness. Authentication failed for list refs",
  "on github.com.",
  "No token available.",
  "Set GITHUB_APM_PAT or GITHUB_TOKEN, or run 'gh auth login'.",
  "If packages span multiple organizations, set per-org tokens:",
  "GITHUB_APM_PAT_FIMOKLEI",
  "  cmdline: git ls-remote --tags --heads",
  "https://github.com/fimoklei/agent-harness",
  "  stderr: 'fatal: could not read Username for 'https://github.com': terminal",
  "prompts disabled'",
].join("\n");

const viewAuthFailedOutputWithoutAuthPhrases = [
  "Set GITHUB_APM_PAT or GITHUB_TOKEN, or run 'gh auth login'.",
  "  stderr: 'fatal: could not read Username for 'https://github.com': terminal",
  "prompts disabled'",
].join("\n");

const symlinkRefusalWithoutMarkerOutputApm026 = [
  "  [x] 1 package failed:",
  "    +- fimoklei/agent-harness/skills/tdd -- Failed to integrate primitives from ",
  "cached package: Skill destination /tmp/apm-fx-symlink/.claude/skills/tdd is a ",
  "symlink -- refusing to deploy",
  "[x] Installation failed with 1 error(s) in 3.4s. No install transaction changes ",
  "were committed.",
].join("\n");

const UNINSTALL_OK_SUMMARY =
  "[*] Uninstall complete: Removed 1 package(s) from apm.yml, Removed 1 package(s) from apm_modules/";

const uninstallOkOutputApm029 = [
  "[>] Uninstalling 1 package(s)...",
  "[+] fimoklei/agent-harness/skills/tdd - found in apm.yml",
  "[i] Cleaned 14 stale files from fimoklei/agent-harness/skills/tdd",
  "[i] Removed fimoklei/agent-harness/skills/tdd from dependencies.apm in apm.yml",
  "[i] Removed fimoklei/agent-harness/skills/tdd from apm_modules/",
  "    Path: fimoklei/agent-harness/skills/tdd",
  "  |-- (files unchanged)",
  UNINSTALL_OK_SUMMARY,
].join("\n");

const uninstallNotFoundOutputApm029 = [
  "[>] Uninstalling 1 package(s)...",
  "[x] github.com/fimoklei/agent-harness/skills/tdd#v0.5.1 was not found in apm.yml. Run 'apm deps list' and retry with an installed package identifier.",
  "[x] Uninstall aborted: 1 requested package(s) could not be selected. Resolve the errors above and retry; no changes were made.",
].join("\n");

const uninstallRetainedEditOutputApm029 = [
  "[>] Uninstalling 1 package(s)...",
  "[+] fimoklei/agent-harness/skills/tdd - found in apm.yml",
  "Retained user-edited file .claude/skills/tdd/SKILL.md from fimoklei/agent-harness/skills/tdd; resolve it and retry.",
  "[i] Cleaned 12 stale files from fimoklei/agent-harness/skills/tdd",
  "[x] Uninstall could not remove tracked target files; package state was preserved.",
  "[x]   - .claude/skills/tdd",
  "[x]   - .claude/skills/tdd/SKILL.md",
  "[x] Resolve or remove the listed files, then retry uninstall.",
].join("\n");

const versionsTableRowsApm026 = [
  "┃ Name   ┃ Type   ┃ Commit   ┃",
  "│ v0.5.1 │ tag    │ 471c4b26 │",
  "│ v0.5.0 │ tag    │ ec491f15 │",
  "│ main   │ branch │ 3a82d265 │",
].join("\n");

function fakeRun(stdout = "") {
  const calls: RunCall[] = [];
  const run = async (
    file: string,
    args: string[],
    options?: { cwd?: string },
  ) => {
    calls.push({ file, args, cwd: options?.cwd });
    return { stdout, stderr: "" };
  };
  return { run, calls };
}

function rejectingRun(output: { stdout?: string; stderr?: string }) {
  const run = async () => {
    const error = Object.assign(new Error("Command failed: apm view"), {
      code: 1,
      stdout: output.stdout ?? "",
      stderr: output.stderr ?? "",
    });
    throw error;
  };
  return { run };
}

describe("ApmCliDriver.deploySkill", () => {
  const ref = "github.com/fimoklei/agent-harness/skills/tdd#v0.5.1";

  it("installs the ref targeting both claude and codex in the repo", async () => {
    const { run, calls } = fakeRun(installOkOutputApm026);
    const driver = new ApmCliDriver({ run });

    await driver.deploySkill({
      target: { kind: "repo", repoPath: "/repo" },
      ref,
    });

    expect(calls).toEqual([
      {
        file: "apm",
        args: ["install", ref, "-t", "claude,codex"],
        cwd: "/repo",
      },
    ]);
  });

  it("passes the whole selection as one --skill flag per name", async () => {
    const { run, calls } = fakeRun(installOkOutputApm026);
    const driver = new ApmCliDriver({ run });
    const root = "github.com/fimoklei/agent-harness#v0.6.0";

    await driver.deploySkill({
      target: { kind: "repo", repoPath: "/repo" },
      ref: root,
      skills: ["prototype", "review"],
    });

    expect(calls).toEqual([
      {
        file: "apm",
        args: [
          "install",
          root,
          "--skill",
          "prototype",
          "--skill",
          "review",
          "-t",
          "claude,codex",
        ],
        cwd: "/repo",
      },
    ]);
  });

  it("passes the selection on a global install too", async () => {
    const { run, calls } = fakeRun(installOkOutputApm026);
    const driver = new ApmCliDriver({
      run,
      prepareGlobalCwd: async () => "/scratch/.apm-scratch",
    });
    const root = "github.com/fimoklei/agent-harness#v0.6.0";

    await driver.deploySkill({
      target: { kind: "global" },
      ref: root,
      skills: ["prototype"],
      tools: ["claude"],
    });

    expect(calls).toEqual([
      {
        file: "apm",
        args: ["install", root, "--skill", "prototype", "-g", "-t", "claude"],
        cwd: "/scratch/.apm-scratch",
      },
    ]);
  });

  it("installs globally with -g from the prepared scratch cwd", async () => {
    const { run, calls } = fakeRun(installOkOutputApm026);
    const driver = new ApmCliDriver({
      run,
      prepareGlobalCwd: async () => "/scratch/.apm-scratch",
    });

    await driver.deploySkill({
      target: { kind: "global" },
      ref,
      tools: ["claude", "codex"],
    });

    expect(calls).toEqual([
      {
        file: "apm",
        args: ["install", ref, "-g", "-t", "claude,codex"],
        cwd: "/scratch/.apm-scratch",
      },
    ]);
  });

  it("fails closed on a global install with no detected tools", async () => {
    const { run, calls } = fakeRun(installOkOutputApm026);
    const driver = new ApmCliDriver({
      run,
      prepareGlobalCwd: async () => "/scratch/.apm-scratch",
    });

    await expect(
      driver.deploySkill({ target: { kind: "global" }, ref, tools: [] }),
    ).rejects.toThrow();
    expect(calls).toEqual([]);
  });

  it("scopes the global -t flag to the tools passed in", async () => {
    const { run, calls } = fakeRun(installOkOutputApm026);
    const driver = new ApmCliDriver({
      run,
      prepareGlobalCwd: async () => "/scratch/.apm-scratch",
    });

    await driver.deploySkill({
      target: { kind: "global" },
      ref,
      tools: ["claude"],
    });

    expect(calls).toEqual([
      {
        file: "apm",
        args: ["install", ref, "-g", "-t", "claude"],
        cwd: "/scratch/.apm-scratch",
      },
    ]);
  });

  it("targets both tools globally when both are passed in", async () => {
    const { run, calls } = fakeRun(installOkOutputApm026);
    const driver = new ApmCliDriver({
      run,
      prepareGlobalCwd: async () => "/scratch/.apm-scratch",
    });

    await driver.deploySkill({
      target: { kind: "global" },
      ref,
      tools: ["claude", "codex"],
    });

    expect(calls).toEqual([
      {
        file: "apm",
        args: ["install", ref, "-g", "-t", "claude,codex"],
        cwd: "/scratch/.apm-scratch",
      },
    ]);
  });

  it("ignores tools on a repo install — the repo path targets every tool", async () => {
    const { run, calls } = fakeRun(installOkOutputApm026);
    const driver = new ApmCliDriver({ run });

    await driver.deploySkill({
      target: { kind: "repo", repoPath: "/repo" },
      ref,
      tools: ["claude"],
    });

    expect(calls).toEqual([
      {
        file: "apm",
        args: ["install", ref, "-t", "claude,codex"],
        cwd: "/repo",
      },
    ]);
  });

  it("fails closed on a resolved run that prints no success marker", async () => {
    const { run } = fakeRun("[*] Created apm.yml\nNothing to install.");
    const driver = new ApmCliDriver({ run });

    await expect(
      driver.deploySkill({ target: { kind: "repo", repoPath: "/repo" }, ref }),
    ).resolves.toEqual({ ok: false, reason: "failed" });
  });

  it("reports a generic failure when every probe failed", async () => {
    const { run } = rejectingRun({ stdout: installProbesFailedOutputApm026 });
    const driver = new ApmCliDriver({ run });

    await expect(
      driver.deploySkill({ target: { kind: "repo", repoPath: "/repo" }, ref }),
    ).resolves.toEqual({ ok: false, reason: "failed" });
  });

  it("fails the whole batch when one staged name fails", async () => {
    const { run } = rejectingRun({ stdout: batchUnknownSkillOutputApm029 });
    const driver = new ApmCliDriver({ run });

    await expect(
      driver.deploySkill({
        target: { kind: "repo", repoPath: "/repo" },
        ref,
        skills: ["47", "audit-dependencies", "no-such-skill"],
      }),
    ).resolves.toEqual({ ok: false, reason: "failed" });
  });

  it("reads a batch that skipped a symlinked destination as a full success", async () => {
    const { run } = fakeRun(batchSymlinkSkippedOutputApm029);
    const driver = new ApmCliDriver({ run });

    await expect(
      driver.deploySkill({
        target: { kind: "repo", repoPath: "/repo" },
        ref,
        skills: ["47", "audit-dependencies", "caveman"],
      }),
    ).resolves.toEqual({ ok: true });
  });

  it("reports success when the positive success marker is present", async () => {
    const { run } = fakeRun(installOkOutputApm026);
    const driver = new ApmCliDriver({ run });

    await expect(
      driver.deploySkill({ target: { kind: "repo", repoPath: "/repo" }, ref }),
    ).resolves.toEqual({ ok: true });
  });

  it("reports success when apm had nothing to change", async () => {
    const { run } = fakeRun(sameRefReinstallOutputApm026);
    const driver = new ApmCliDriver({ run });

    await expect(
      driver.deploySkill({ target: { kind: "repo", repoPath: "/repo" }, ref }),
    ).resolves.toEqual({ ok: true });
  });

  it("logs the repo's folder name, never its full path", async () => {
    const { run } = fakeRun(installOkOutputApm026);
    const logged: { target: string }[] = [];
    const driver = new ApmCliDriver({
      run,
      log: (entry) => logged.push(entry),
    });

    await driver.deploySkill({
      target: { kind: "repo", repoPath: "/home/me/work/repo" },
      ref,
    });

    expect(logged.map((entry) => entry.target)).toEqual(["repo"]);
  });

  it("classifies apm's symlinked-destination refusal when no marker is printed", async () => {
    const { run } = rejectingRun({
      stdout: symlinkRefusalWithoutMarkerOutputApm026,
    });
    const driver = new ApmCliDriver({ run });

    await expect(
      driver.deploySkill({ target: { kind: "repo", repoPath: "/repo" }, ref }),
    ).resolves.toEqual({ ok: false, reason: "destination-symlinked" });
  });

  it("does not leak raw apm output in the failure it reports", async () => {
    const tokenBearing = `${symlinkRefusalWithoutMarkerOutputApm026}\nhttps://x-access-token:ghp_secret@github.com`;
    const { run } = rejectingRun({ stdout: tokenBearing });
    const driver = new ApmCliDriver({ run });

    const result = await driver.deploySkill({
      target: { kind: "repo", repoPath: "/repo" },
      ref,
    });

    expect(JSON.stringify(result)).not.toContain("ghp_secret");
  });
});

describe("ApmCliDriver.removeSkill", () => {
  const ref = "github.com/fimoklei/agent-harness/skills/tdd#v0.5.1";

  it("uninstalls the ref in the repo, with no -t flag", async () => {
    const { run, calls } = fakeRun(uninstallOkOutputApm029);
    const driver = new ApmCliDriver({ run });

    await driver.removeSkill({
      target: { kind: "repo", repoPath: "/repo" },
      ref,
    });

    expect(calls).toEqual([
      { file: "apm", args: ["uninstall", ref], cwd: "/repo" },
    ]);
  });

  it("uninstalls globally with -g from the prepared scratch cwd", async () => {
    const { run, calls } = fakeRun(uninstallOkOutputApm029);
    const driver = new ApmCliDriver({
      run,
      prepareGlobalCwd: async () => "/scratch/.apm-scratch",
    });

    await driver.removeSkill({ target: { kind: "global" }, ref });

    expect(calls).toEqual([
      {
        file: "apm",
        args: ["uninstall", ref, "-g"],
        cwd: "/scratch/.apm-scratch",
      },
    ]);
  });

  it("reports success only on apm's positive uninstall marker", async () => {
    const { run } = fakeRun(uninstallOkOutputApm029);
    const driver = new ApmCliDriver({ run });

    await expect(
      driver.removeSkill({ target: { kind: "repo", repoPath: "/repo" }, ref }),
    ).resolves.toEqual({ ok: true });
  });

  it("fails closed when nothing was removed, though apm exits 0", async () => {
    const { run } = fakeRun(uninstallNotFoundOutputApm029);
    const driver = new ApmCliDriver({ run });

    await expect(
      driver.removeSkill({ target: { kind: "repo", repoPath: "/repo" }, ref }),
    ).resolves.toEqual({ ok: false });
  });

  it("fails closed when apm kept an edited file and aborted part-way", async () => {
    const { run } = fakeRun(uninstallRetainedEditOutputApm029);
    const driver = new ApmCliDriver({ run });

    await expect(
      driver.removeSkill({ target: { kind: "repo", repoPath: "/repo" }, ref }),
    ).resolves.toEqual({ ok: false });
  });

  it("fails closed when the marker rides along with a not-found note", async () => {
    const partial = [
      uninstallOkOutputApm029,
      "[!] Note: 1 package(s) were not found in apm.yml",
    ].join("\n");
    const { run } = fakeRun(partial);
    const driver = new ApmCliDriver({ run });

    await expect(
      driver.removeSkill({ target: { kind: "repo", repoPath: "/repo" }, ref }),
    ).resolves.toEqual({ ok: false });
  });

  it("reads the marker even when Rich wraps it across a line break", async () => {
    const wrapped = uninstallOkOutputApm029.replace(
      UNINSTALL_OK_SUMMARY,
      "[*] Uninstall complete: Removed 1\npackage(s) from apm.yml, Removed 1 package(s) from apm_modules/",
    );
    expect(wrapped).not.toBe(uninstallOkOutputApm029);
    const { run } = fakeRun(wrapped);
    const driver = new ApmCliDriver({ run });

    await expect(
      driver.removeSkill({ target: { kind: "repo", repoPath: "/repo" }, ref }),
    ).resolves.toEqual({ ok: true });
  });

  it("reads success whatever count the cleaned-stale-files line gives", async () => {
    const cleanedNothing = uninstallOkOutputApm029.replace(
      "Cleaned 14 stale files",
      "Cleaned 0 stale files",
    );
    expect(cleanedNothing).not.toBe(uninstallOkOutputApm029);
    const { run } = fakeRun(cleanedNothing);
    const driver = new ApmCliDriver({ run });

    await expect(
      driver.removeSkill({ target: { kind: "repo", repoPath: "/repo" }, ref }),
    ).resolves.toEqual({ ok: true });
  });

  it("logs the repo's folder name, never its full path", async () => {
    const { run } = fakeRun(uninstallOkOutputApm029);
    const logged: { target: string }[] = [];
    const driver = new ApmCliDriver({
      run,
      log: (entry) => logged.push(entry),
    });

    await driver.removeSkill({
      target: { kind: "repo", repoPath: "/home/me/work/repo" },
      ref,
    });

    expect(logged.map((entry) => entry.target)).toEqual(["repo"]);
  });

  it("fails closed when apm exits non-zero", async () => {
    const { run } = rejectingRun({ stderr: "Missing argument 'PACKAGES...'." });
    const driver = new ApmCliDriver({ run });

    await expect(
      driver.removeSkill({ target: { kind: "repo", repoPath: "/repo" }, ref }),
    ).resolves.toEqual({ ok: false });
  });

  it("does not leak raw apm output in the failure it reports", async () => {
    const tokenBearing = `${uninstallNotFoundOutputApm029}\nhttps://x-access-token:ghp_secret@github.com`;
    const { run } = fakeRun(tokenBearing);
    const driver = new ApmCliDriver({ run });

    const result = await driver.removeSkill({
      target: { kind: "repo", repoPath: "/repo" },
      ref,
    });

    expect(JSON.stringify(result)).not.toContain("ghp_secret");
  });
});

describe("ApmCliDriver.resolveLatestTag", () => {
  it("returns ok with the latest tag from the versions table", async () => {
    const { run } = fakeRun(versionsTableRowsApm026);
    const driver = new ApmCliDriver({ run });

    expect(await driver.resolveLatestTag("fimoklei/agent-harness")).toEqual({
      ok: true,
      tag: "v0.5.1",
    });
  });

  it("returns no-tag when apm answers but no deployable tag exists", async () => {
    const { run } = fakeRun("│ main │ branch │ 41ecfe81 │");
    const driver = new ApmCliDriver({ run });

    expect(await driver.resolveLatestTag("fimoklei/agent-harness")).toEqual({
      ok: false,
      reason: "no-tag",
    });
  });

  it("classifies auth-required from apm's fixed auth phrases", async () => {
    const { run } = rejectingRun({ stdout: viewAuthFailedOutput });
    const driver = new ApmCliDriver({ run });

    expect(await driver.resolveLatestTag("fimoklei/agent-harness")).toEqual({
      ok: false,
      reason: "auth-required",
    });
  });

  it("classifies auth-required when the phrases arrive on stderr", async () => {
    const { run } = rejectingRun({ stderr: viewAuthFailedOutput });
    const driver = new ApmCliDriver({ run });

    expect(await driver.resolveLatestTag("fimoklei/agent-harness")).toEqual({
      ok: false,
      reason: "auth-required",
    });
  });

  it("classifies auth-required from either auth phrase on its own", async () => {
    const alone = [
      "[x] Authentication failed for list refs on github.com.",
      "[x] No token available.",
    ];

    for (const output of alone) {
      const { run } = rejectingRun({ stderr: output });
      const driver = new ApmCliDriver({ run });

      expect(await driver.resolveLatestTag("fimoklei/agent-harness")).toEqual({
        ok: false,
        reason: "auth-required",
      });
    }
  });

  it("returns failed for a non-auth apm error, never auth-required", async () => {
    const { run } = rejectingRun({
      stderr: "fatal: unable to access github.com: Could not resolve host",
    });
    const driver = new ApmCliDriver({ run });

    expect(await driver.resolveLatestTag("fimoklei/agent-harness")).toEqual({
      ok: false,
      reason: "failed",
    });
  });

  it("does not classify the git passthrough or env-hint lines as auth", async () => {
    const { run } = rejectingRun({
      stderr: viewAuthFailedOutputWithoutAuthPhrases,
    });
    const driver = new ApmCliDriver({ run });

    expect(await driver.resolveLatestTag("fimoklei/agent-harness")).toEqual({
      ok: false,
      reason: "failed",
    });
  });

  it("does not leak raw apm output in the failure it reports", async () => {
    const { run } = rejectingRun({
      stderr: `${viewAuthFailedOutputWithoutAuthPhrases}\nhttps://x-access-token:ghp_secret@github.com`,
    });
    const driver = new ApmCliDriver({ run });

    const result = await driver.resolveLatestTag("fimoklei/agent-harness");

    expect(JSON.stringify(result)).not.toContain("ghp_secret");
  });
});

describe("ApmCliDriver.checkOutdated", () => {
  it("widens the terminal so apm keeps the Package column whole", async () => {
    const columns: (string | undefined)[] = [];
    const run = async (
      _file: string,
      _args: string[],
      options?: { env?: NodeJS.ProcessEnv },
    ) => {
      columns.push(options?.env?.COLUMNS);
      return { stdout: "[*] All dependencies are up-to-date", stderr: "" };
    };
    const driver = new ApmCliDriver({ run });

    await driver.checkOutdated({ kind: "repo", repoPath: "/repo" });

    expect(columns).toEqual(["200"]);
  });

  it("checks global drift with -g from the prepared scratch cwd", async () => {
    const { run, calls } = fakeRun("[*] All dependencies are up-to-date");
    const driver = new ApmCliDriver({
      run,
      prepareGlobalCwd: async () => "/scratch/.apm-scratch",
    });

    await driver.checkOutdated({ kind: "global" });

    expect(calls).toEqual([
      {
        file: "apm",
        args: ["outdated", "-g"],
        cwd: "/scratch/.apm-scratch",
      },
    ]);
  });
});

function hangingRun() {
  const signals: (AbortSignal | undefined)[] = [];
  const run = (
    _file: string,
    _args: string[],
    options?: { signal?: AbortSignal },
  ) => {
    signals.push(options?.signal);
    return new Promise<never>(() => undefined);
  };
  return { run, signals };
}

describe("ApmCliDriver timeouts", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const repo = { kind: "repo", repoPath: "/repo" } as const;
  const ref = "github.com/fimoklei/agent-harness/skills/tdd#v0.5.1";

  it("ends every hung apm call as timed out", async () => {
    vi.useFakeTimers();
    const { run, signals } = hangingRun();
    const driver = new ApmCliDriver({ run });

    const results = Promise.all([
      driver.resolveLatestTag("fimoklei/agent-harness"),
      driver.deploySkill({ target: repo, ref }),
      driver.removeSkill({ target: repo, ref }),
      driver.checkOutdated(repo),
    ]);
    await vi.runAllTimersAsync();

    expect(await results).toEqual([
      { ok: false, reason: "timed-out" },
      { ok: false, reason: "timed-out" },
      { ok: false, reason: "timed-out" },
      { ok: false, reason: "timed-out" },
    ]);
    expect(signals.map((signal) => signal?.aborted)).toEqual([
      true,
      true,
      true,
      true,
    ]);
  });

  it("waits longer for a hung install than for a hung read", async () => {
    vi.useFakeTimers();
    const { run } = hangingRun();
    const driver = new ApmCliDriver({ run });
    const settled: string[] = [];

    void driver
      .resolveLatestTag("fimoklei/agent-harness")
      .then(() => settled.push("read"));
    void driver
      .deploySkill({ target: repo, ref })
      .then(() => settled.push("install"));
    await vi.advanceTimersByTimeAsync(60_000);

    expect(settled).toEqual(["read"]);
    await vi.runAllTimersAsync();
    expect(settled).toEqual(["read", "install"]);
  });
});
