import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApmCliDriver } from "./apm-cli-driver";

function fixture(name: string): string {
  return readFileSync(
    join(import.meta.dirname, "../../../../tests/fixtures", name),
    "utf8",
  );
}

type RunCall = { file: string; args: string[]; cwd?: string };

const installOkOutput = fixture("apm-install-ok.txt");

const sameRefReinstallOutput = fixture("apm-install-no-changes.txt");

const narrowedOutput = fixture("apm-install-narrowed.txt");

const batchUnknownSkillOutput = fixture("apm-install-unknown-skill.txt");

const unmanagedConflictOutput = fixture("apm-install-unmanaged-conflict.txt");

const installProbesFailedOutput = fixture("apm-install-probes-failed.txt");

const viewAuthFailedOutput = fixture("apm-view-auth-failed.txt");

const viewAuthFailedOutputWithoutAuthPhrases = [
  "Set GITHUB_APM_PAT or GITHUB_TOKEN, or run 'gh auth login'.",
  "  stderr: 'fatal: could not read Username for 'https://github.com': terminal",
  "prompts disabled'",
].join("\n");

const symlinkRefusalOutput = fixture("apm-install-symlink-refused.txt");

const linkedToolFolderGlobalOutput = fixture(
  "apm-install-tool-folder-linked-global.txt",
);

const linkedToolFolderRepoOutput = fixture(
  "apm-install-tool-folder-linked-repo.txt",
);

const linkedToolFolderUninstallOutput = fixture(
  "apm-uninstall-tool-folder-linked.txt",
);

const UNINSTALL_OK_SUMMARY = "[*] Uninstall complete: removed 1 package";

const uninstallOkOutput = fixture("apm-uninstall-ok.txt");

const uninstallNotFoundOutput = fixture("apm-uninstall-not-found.txt");

const uninstallRetainedEditOutput = fixture("apm-uninstall-retained.txt");

const uninstallSelectedProfileOnlyOutput = fixture(
  "apm-uninstall-selected-profile-only.txt",
);

const versionsTable = fixture("apm-view-versions.txt");

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

function sequenceRun(outputs: readonly string[]) {
  const calls: (RunCall & { env: NodeJS.ProcessEnv })[] = [];
  const run = async (
    file: string,
    args: string[],
    options: { cwd?: string; env: NodeJS.ProcessEnv },
  ) => {
    calls.push({ file, args, cwd: options.cwd, env: options.env });
    return { stdout: outputs[calls.length - 1] ?? "", stderr: "" };
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
    const { run, calls } = fakeRun(installOkOutput);
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
    const { run, calls } = fakeRun(installOkOutput);
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
    const { run, calls } = fakeRun(installOkOutput);
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
    const { run, calls } = fakeRun(installOkOutput);
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
    const { run, calls } = fakeRun(installOkOutput);
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
    const { run, calls } = fakeRun(installOkOutput);
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
    const { run, calls } = fakeRun(installOkOutput);
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
    const { run, calls } = fakeRun(installOkOutput);
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
    const { run } = rejectingRun({ stdout: installProbesFailedOutput });
    const driver = new ApmCliDriver({ run });

    await expect(
      driver.deploySkill({ target: { kind: "repo", repoPath: "/repo" }, ref }),
    ).resolves.toEqual({ ok: false, reason: "failed" });
  });

  it("fails the whole batch when one staged name fails", async () => {
    const { run } = rejectingRun({ stdout: batchUnknownSkillOutput });
    const driver = new ApmCliDriver({ run });

    await expect(
      driver.deploySkill({
        target: { kind: "repo", repoPath: "/repo" },
        ref,
        skills: ["47", "audit-dependencies", "no-such-skill"],
      }),
    ).resolves.toEqual({ ok: false, reason: "failed" });
  });

  it("fails the whole batch when a selected name meets a hand-made folder", async () => {
    const { run } = rejectingRun({ stdout: unmanagedConflictOutput });
    const driver = new ApmCliDriver({ run });

    await expect(
      driver.deploySkill({
        target: { kind: "repo", repoPath: "/repo" },
        ref,
        skills: ["47", "caveman"],
      }),
    ).resolves.toEqual({ ok: false, reason: "failed" });
  });

  it("reports success when apm only upgraded an older lockfile", async () => {
    const { run } = fakeRun(fixture("apm-install-lockfile-upgraded.txt"));
    const driver = new ApmCliDriver({
      run,
      prepareGlobalCwd: async () => "/scratch",
    });

    await expect(
      driver.deploySkill({
        target: { kind: "global" },
        ref,
        skills: ["47"],
        tools: ["claude", "codex"],
      }),
    ).resolves.toEqual({ ok: true });
  });

  it("reports success when a narrowed Selection only cleaned stale files", async () => {
    const { run } = fakeRun(narrowedOutput);
    const driver = new ApmCliDriver({ run });

    await expect(
      driver.deploySkill({
        target: { kind: "repo", repoPath: "/repo" },
        ref,
        skills: ["47"],
      }),
    ).resolves.toEqual({ ok: true });
  });

  it("fails closed when the install summary counts errors", async () => {
    const withErrors = installOkOutput.replace(
      /Installed 1 APM dependency in ([\d.]+)s\./,
      "Installed 1 APM dependency in $1s with 1 error(s).",
    );
    expect(withErrors).not.toBe(installOkOutput);
    const { run } = fakeRun(withErrors);
    const driver = new ApmCliDriver({ run });

    await expect(
      driver.deploySkill({ target: { kind: "repo", repoPath: "/repo" }, ref }),
    ).resolves.toEqual({ ok: false, reason: "failed" });
  });

  it("fails closed when apm skipped some requested packages", async () => {
    const skipped = installOkOutput.replace(
      /Installed 1 APM dependency in ([\d.]+)s\./,
      "Installed 1 APM dependency in $1s; some requested packages were skipped.",
    );
    expect(skipped).not.toBe(installOkOutput);
    const { run } = fakeRun(skipped);
    const driver = new ApmCliDriver({ run });

    await expect(
      driver.deploySkill({ target: { kind: "repo", repoPath: "/repo" }, ref }),
    ).resolves.toEqual({ ok: false, reason: "failed" });
  });

  it("reports success when the positive success marker is present", async () => {
    const { run } = fakeRun(installOkOutput);
    const driver = new ApmCliDriver({ run });

    await expect(
      driver.deploySkill({ target: { kind: "repo", repoPath: "/repo" }, ref }),
    ).resolves.toEqual({ ok: true });
  });

  it("reports success when apm had nothing to change", async () => {
    const { run } = fakeRun(sameRefReinstallOutput);
    const driver = new ApmCliDriver({ run });

    await expect(
      driver.deploySkill({ target: { kind: "repo", repoPath: "/repo" }, ref }),
    ).resolves.toEqual({ ok: true });
  });

  it("logs the repo's folder name, never its full path", async () => {
    const { run } = fakeRun(installOkOutput);
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
      stdout: symlinkRefusalOutput,
    });
    const driver = new ApmCliDriver({ run });

    await expect(
      driver.deploySkill({ target: { kind: "repo", repoPath: "/repo" }, ref }),
    ).resolves.toEqual({ ok: false, reason: "destination-symlinked" });
  });

  it.each([
    ["a Global tool folder", linkedToolFolderGlobalOutput],
    ["a consuming repo's tool folder", linkedToolFolderRepoOutput],
  ])("classifies apm's refusal of %s that is a link", async (_case, stdout) => {
    const { run } = rejectingRun({ stdout });
    const driver = new ApmCliDriver({ run });

    await expect(
      driver.deploySkill({ target: { kind: "repo", repoPath: "/repo" }, ref }),
    ).resolves.toEqual({ ok: false, reason: "destination-symlinked" });
  });

  it("does not leak raw apm output in the failure it reports", async () => {
    const tokenBearing = `${symlinkRefusalOutput}\nhttps://x-access-token:ghp_secret@github.com`;
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
    const { run, calls } = fakeRun(uninstallOkOutput);
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
    const { run, calls } = fakeRun(uninstallOkOutput);
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
    const { run } = fakeRun(uninstallOkOutput);
    const driver = new ApmCliDriver({ run });

    await expect(
      driver.removeSkill({ target: { kind: "repo", repoPath: "/repo" }, ref }),
    ).resolves.toEqual({ ok: true });
  });

  it("fails closed when nothing was removed, though apm exits 0", async () => {
    const { run } = fakeRun(uninstallNotFoundOutput);
    const driver = new ApmCliDriver({ run });

    await expect(
      driver.removeSkill({ target: { kind: "repo", repoPath: "/repo" }, ref }),
    ).resolves.toEqual({ ok: false });
  });

  it("classifies apm's refusal to uninstall through a linked tool folder", async () => {
    const { run } = rejectingRun({ stdout: linkedToolFolderUninstallOutput });
    const driver = new ApmCliDriver({ run });

    await expect(
      driver.removeSkill({ target: { kind: "repo", repoPath: "/repo" }, ref }),
    ).resolves.toEqual({ ok: false, reason: "destination-symlinked" });
  });

  it("fails closed when apm kept an edited file and aborted part-way", async () => {
    const { run } = fakeRun(uninstallRetainedEditOutput);
    const driver = new ApmCliDriver({ run });

    await expect(
      driver.removeSkill({ target: { kind: "repo", repoPath: "/repo" }, ref }),
    ).resolves.toEqual({ ok: false });
  });

  it("fails closed when apm removed the package from the selected profile only and no former folder is recorded", async () => {
    const { run } = fakeRun(uninstallSelectedProfileOnlyOutput);
    const driver = new ApmCliDriver({
      run,
      prepareGlobalCwd: async () => "/scratch",
      formerClaudeProfiles: async () => [],
    });

    await expect(
      driver.removeSkill({ target: { kind: "global" }, ref }),
    ).resolves.toEqual({ ok: false });
  });

  it("retries without CLAUDE_CONFIG_DIR when the former Claude Code folder is ~/.claude", async () => {
    vi.stubEnv("CLAUDE_CONFIG_DIR", "/home/ada/.claude-work");
    const { run, calls } = sequenceRun([
      uninstallSelectedProfileOnlyOutput,
      fixture("apm-uninstall-selected-profile-retry.txt"),
    ]);
    const driver = new ApmCliDriver({
      run,
      prepareGlobalCwd: async () => "/scratch",
      formerClaudeProfiles: async () => [{ configDir: null }],
    });

    await expect(
      driver.removeSkill({ target: { kind: "global" }, ref }),
    ).resolves.toEqual({ ok: true });
    expect(calls.map((call) => call.args)).toEqual([
      ["uninstall", ref, "-g"],
      ["uninstall", ref, "-g"],
    ]);
    expect(calls[1]?.env).not.toHaveProperty("CLAUDE_CONFIG_DIR");
  });

  it("retries with CLAUDE_CONFIG_DIR set to the former Claude Code folder", async () => {
    vi.stubEnv("CLAUDE_CONFIG_DIR", undefined);
    const { run, calls } = sequenceRun([
      fixture("apm-uninstall-selected-profile-only-reverse.txt"),
      fixture("apm-uninstall-selected-profile-retry-reverse.txt"),
    ]);
    const driver = new ApmCliDriver({
      run,
      prepareGlobalCwd: async () => "/scratch",
      formerClaudeProfiles: async () => [
        { configDir: "/home/ada/.claude-work" },
      ],
    });

    await expect(
      driver.removeSkill({ target: { kind: "global" }, ref }),
    ).resolves.toEqual({ ok: true });
    expect(calls[1]?.env.CLAUDE_CONFIG_DIR).toBe("/home/ada/.claude-work");
  });

  it("fails closed when the retry also removes from the selected profile only", async () => {
    const { run, calls } = sequenceRun([
      uninstallSelectedProfileOnlyOutput,
      uninstallSelectedProfileOnlyOutput,
    ]);
    const driver = new ApmCliDriver({
      run,
      prepareGlobalCwd: async () => "/scratch",
      formerClaudeProfiles: async () => [{ configDir: null }],
    });

    await expect(
      driver.removeSkill({ target: { kind: "global" }, ref }),
    ).resolves.toEqual({ ok: false });
    expect(calls).toHaveLength(2);
  });

  it("reports a timed-out retry as timed out", async () => {
    let call = 0;
    const run = async () => {
      call += 1;
      if (call === 1) {
        return { stdout: uninstallSelectedProfileOnlyOutput, stderr: "" };
      }
      throw Object.assign(new Error("killed"), {
        killed: true,
        signal: "SIGTERM",
      });
    };
    const driver = new ApmCliDriver({
      run,
      prepareGlobalCwd: async () => "/scratch",
      formerClaudeProfiles: async () => [{ configDir: null }],
    });

    await expect(
      driver.removeSkill({ target: { kind: "global" }, ref }),
    ).resolves.toEqual({ ok: false, reason: "timed-out" });
  });

  it("runs no retry for a repo target", async () => {
    const { run, calls } = sequenceRun([
      uninstallSelectedProfileOnlyOutput,
      fixture("apm-uninstall-selected-profile-retry.txt"),
    ]);
    const driver = new ApmCliDriver({
      run,
      formerClaudeProfiles: async () => [{ configDir: null }],
    });

    await expect(
      driver.removeSkill({ target: { kind: "repo", repoPath: "/repo" }, ref }),
    ).resolves.toEqual({ ok: false });
    expect(calls).toHaveLength(1);
  });

  it("reports success when the copies lived under CLAUDE_CONFIG_DIR alone", async () => {
    const { run } = fakeRun(fixture("apm-uninstall-claude-config-dir.txt"));
    const driver = new ApmCliDriver({
      run,
      prepareGlobalCwd: async () => "/scratch",
    });

    await expect(
      driver.removeSkill({ target: { kind: "global" }, ref }),
    ).resolves.toEqual({ ok: true });
  });

  it("fails closed when the marker rides along with a not-found note", async () => {
    const partial = [
      uninstallOkOutput,
      "[x] github.com/fimoklei/agent-harness/skills/47#v0.5.1 was not found in apm.yml.",
    ].join("\n");
    const { run } = fakeRun(partial);
    const driver = new ApmCliDriver({ run });

    await expect(
      driver.removeSkill({ target: { kind: "repo", repoPath: "/repo" }, ref }),
    ).resolves.toEqual({ ok: false });
  });

  it("reads the marker even when Rich wraps it across a line break", async () => {
    const wrapped = uninstallOkOutput.replace(
      UNINSTALL_OK_SUMMARY,
      "[*] Uninstall complete: removed\n1 package",
    );
    expect(wrapped).not.toBe(uninstallOkOutput);
    const { run } = fakeRun(wrapped);
    const driver = new ApmCliDriver({ run });

    await expect(
      driver.removeSkill({ target: { kind: "repo", repoPath: "/repo" }, ref }),
    ).resolves.toEqual({ ok: true });
  });

  it("reads success whatever count the cleaned-stale-paths line gives", async () => {
    const cleanedNothing = uninstallOkOutput.replace(
      "Cleaned 2 stale deployed paths",
      "Cleaned 0 stale deployed paths",
    );
    expect(cleanedNothing).not.toBe(uninstallOkOutput);
    const { run } = fakeRun(cleanedNothing);
    const driver = new ApmCliDriver({ run });

    await expect(
      driver.removeSkill({ target: { kind: "repo", repoPath: "/repo" }, ref }),
    ).resolves.toEqual({ ok: true });
  });

  it("logs the repo's folder name, never its full path", async () => {
    const { run } = fakeRun(uninstallOkOutput);
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
    const tokenBearing = `${uninstallNotFoundOutput}\nhttps://x-access-token:ghp_secret@github.com`;
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
    const { run } = fakeRun(versionsTable);
    const driver = new ApmCliDriver({ run });

    expect(await driver.resolveLatestTag("fimoklei/agent-harness")).toEqual({
      ok: true,
      tag: "v0.6.0",
    });
  });

  it("returns no-tag when apm answers but no deployable tag exists", async () => {
    const { run } = fakeRun("| main | branch | 41ecfe81 |");
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
