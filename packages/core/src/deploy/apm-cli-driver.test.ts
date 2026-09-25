import { describe, expect, it } from "vitest";
import { ApmCliDriver } from "./apm-cli-driver";

type RunCall = { file: string; args: string[]; cwd?: string };

// Named so a test that mutates it fails loudly when a refreshed capture changes.
const INSTALL_OK_SUMMARY = "[*] Installed 1 APM dependency in 3.8s.";

// Captured `apm install ... -t claude`, apm 0.26.0.
const installOkOutput = [
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

// Same-ref re-install, apm 0.26.0: the no-op summary, never the `Installed` marker.
const installNoChangesOutput = [
  "[*] Validating 1 package...",
  "[+] fimoklei/agent-harness/.apm/skills/47#v0.6.0 (already in apm.yml)",
  "[>] Installing 1 new package...",
  "[i] Targets: claude, codex  (source: --target flag)",
  "  [+] github.com/fimoklei/agent-harness/.apm/skills/47#v0.6.0 #v0.6.0 @f8208f12 (cached)",
  "  |-- (files unchanged)",
  "",
  "[i] No changes -- install state already up to date in 1.5s.",
].join("\n");

// Batch install with one unknown `--skill` name, apm 0.29.0: exit 1 fails every name (#1039).
const batchUnknownSkillOutput = [
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

// Batch install over a symlinked skill folder, apm 0.29.0: exit 0 with the
// marker, and the output never names the skipped link (#1039).
const batchSymlinkSkippedOutput = [
  "  [+] fimoklei/agent-harness #v0.6.0 @f8208f12",
  "  |-- 2 skill(s) integrated -> .agents/skills/, .claude/skills/",
  "[i] Added apm_modules/ to .gitignore",
  "  [!] 1 file skipped -- local files exist, not managed by APM",
  "    Use 'apm install --force' to overwrite",
  "[*] Installed 1 APM dependency in 2.9s.",
].join("\n");

// Failed install, apm 0.26.0: exit 1 with no marker and no failure signal, so
// only the absent marker makes it a failure.
const installProbesFailedOutput = [
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

// `apm view ... versions` under missing auth: both fixed auth phrases plus the
// env-hint and `could not read Username` noise the allowlist must ignore.
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

// The same error minus the two fixed phrases; must never classify as auth (#119).
const viewNonAuthNoise = [
  "Set GITHUB_APM_PAT or GITHUB_TOKEN, or run 'gh auth login'.",
  "  stderr: 'fatal: could not read Username for 'https://github.com': terminal",
  "prompts disabled'",
].join("\n");

// apm 0.20.0 symlink refusal. No fixture file survives, and it cannot be
// re-captured without downgrading apm. It prints the success marker on a failed
// install: the reason the classifier ignores the exit code.
const installSymlinkRefusedOutput = [
  "[>] Installing 1 new package...",
  "  [+] github.com/fimoklei/agent-harness/skills/tdd#v0.5.1 #v0.5.1 @471c4b26",
  "  [x] 1 package failed:",
  "    +- fimoklei/agent-harness/skills/tdd -- Failed to integrate primitives from ",
  "cached package: Skill destination /tmp/apm-symlink-fixture/.claude/skills/tdd is",
  "a symlink -- refusing to deploy",
  "[!] Installed 1 APM dependency in 3.2s with 1 error(s).",
  "[!] Install interrupted after 3.2s.",
].join("\n");

// apm 0.26.0 symlink refusal: exit 1, no marker. Rich splits the phrase as
// `is a` / `symlink`, so whitespace normalization is still needed.
const installRefusedWithoutMarkerOutput = [
  "  [x] 1 package failed:",
  "    +- fimoklei/agent-harness/skills/tdd -- Failed to integrate primitives from ",
  "cached package: Skill destination /tmp/apm-fx-symlink/.claude/skills/tdd is a ",
  "symlink -- refusing to deploy",
  "[x] Installation failed with 1 error(s) in 3.4s. No install transaction changes ",
  "were committed.",
].join("\n");

// Named so the wrapping test fails loudly if a refreshed capture changes.
const UNINSTALL_OK_SUMMARY =
  "[*] Uninstall complete: Removed 1 package(s) from apm.yml, Removed 1 package(s) from apm_modules/";

// Captured `apm uninstall -v <ref>`, apm 0.29.0 (#772). Nothing may key on the
// `Cleaned N stale files` count: it counts only what that run deleted.
const uninstallOkOutput = [
  "[>] Uninstalling 1 package(s)...",
  "[+] fimoklei/agent-harness/skills/tdd - found in apm.yml",
  "[i] Cleaned 14 stale files from fimoklei/agent-harness/skills/tdd",
  "[i] Removed fimoklei/agent-harness/skills/tdd from dependencies.apm in apm.yml",
  "[i] Removed fimoklei/agent-harness/skills/tdd from apm_modules/",
  "    Path: fimoklei/agent-harness/skills/tdd",
  "  |-- (files unchanged)",
  UNINSTALL_OK_SUMMARY,
].join("\n");

// Uninstall of a package the repo lacks, apm 0.29.0: exit 1, no success marker.
const uninstallNotFoundOutput = [
  "[>] Uninstalling 1 package(s)...",
  "[x] github.com/fimoklei/agent-harness/skills/tdd#v0.5.1 was not found in apm.yml. Run 'apm deps list' and retry with an installed package identifier.",
  "[x] Uninstall aborted: 1 requested package(s) could not be selected. Resolve the errors above and retry; no changes were made.",
].join("\n");

// Uninstall over one edited deployed file, apm 0.29.0: exit 1, no marker; apm
// kept the edited file, deleted the rest and left the package recorded.
const uninstallRetainedOutput = [
  "[>] Uninstalling 1 package(s)...",
  "[+] fimoklei/agent-harness/skills/tdd - found in apm.yml",
  "Retained user-edited file .claude/skills/tdd/SKILL.md from fimoklei/agent-harness/skills/tdd; resolve it and retry.",
  "[i] Cleaned 12 stale files from fimoklei/agent-harness/skills/tdd",
  "[x] Uninstall could not remove tracked target files; package state was preserved.",
  "[x]   - .claude/skills/tdd",
  "[x]   - .claude/skills/tdd/SKILL.md",
  "[x] Resolve or remove the listed files, then retry uninstall.",
].join("\n");

// Rows from a captured `apm view ... versions` table, apm 0.26.0.
const versionsTableOutput = [
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

// Rejects as promisify(execFile) does on a non-zero exit, output on the error.
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
    // One flag per name: a comma list is not apm's grammar, and a name left out
    // stays installed.
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
    // apm appends apm_modules/ to the cwd's .gitignore even for -g.
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
    // Synthetic, not an apm shape: it pins the marker check itself, which no other
    // test covers because they all supply the marker (#119).
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

  it("reads a batch that skipped a symlinked destination as a success", async () => {
    // Why DeploySkill refuses a linked destination first: this output looks like a
    // full deploy.
    const { run } = fakeRun(batchSymlinkSkippedOutput);
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
    const { run } = fakeRun(installOkOutput);
    const driver = new ApmCliDriver({ run });

    await expect(
      driver.deploySkill({ target: { kind: "repo", repoPath: "/repo" }, ref }),
    ).resolves.toEqual({ ok: true });
  });

  it("reports success when apm had nothing to change", async () => {
    const { run } = fakeRun(installNoChangesOutput);
    const driver = new ApmCliDriver({ run });

    await expect(
      driver.deploySkill({ target: { kind: "repo", repoPath: "/repo" }, ref }),
    ).resolves.toEqual({ ok: true });
  });

  it("reports a failure when the success marker comes with an error count", async () => {
    // apm 0.20.0 printed the marker with `1 error(s)` on a refused install (#180).
    const withErrors = installOkOutput.replace(
      INSTALL_OK_SUMMARY,
      "[*] Installed 1 APM dependency in 3.8s with 1 error(s).",
    );
    const { run } = fakeRun(withErrors);
    const driver = new ApmCliDriver({ run });

    await expect(
      driver.deploySkill({ target: { kind: "repo", repoPath: "/repo" }, ref }),
    ).resolves.toEqual({ ok: false, reason: "failed" });
  });

  it("reports a failure when the error count is wrapped across a line break", async () => {
    // Rich wraps at the terminal width and install pins no COLUMNS (#180).
    const wrapped = installOkOutput.replace(
      INSTALL_OK_SUMMARY,
      "[*] Installed 1 APM dependency in 3.8s with 1\nerror(s).",
    );
    const { run } = fakeRun(wrapped);
    const driver = new ApmCliDriver({ run });

    await expect(
      driver.deploySkill({ target: { kind: "repo", repoPath: "/repo" }, ref }),
    ).resolves.toEqual({ ok: false, reason: "failed" });
  });

  it("classifies apm's symlinked-destination refusal (0.20.0 shape)", async () => {
    const { run } = rejectingRun({ stdout: installSymlinkRefusedOutput });
    const driver = new ApmCliDriver({ run });

    await expect(
      driver.deploySkill({ target: { kind: "repo", repoPath: "/repo" }, ref }),
    ).resolves.toEqual({ ok: false, reason: "destination-symlinked" });
  });

  it("classifies apm's symlinked-destination refusal when no marker is printed", async () => {
    const { run } = rejectingRun({ stdout: installRefusedWithoutMarkerOutput });
    const driver = new ApmCliDriver({ run });

    await expect(
      driver.deploySkill({ target: { kind: "repo", repoPath: "/repo" }, ref }),
    ).resolves.toEqual({ ok: false, reason: "destination-symlinked" });
  });

  it("does not leak raw apm output in the failure it reports", async () => {
    // The 0.26.0 refusal shape: the one production meets today.
    const tokenBearing = `${installRefusedWithoutMarkerOutput}\nhttps://x-access-token:ghp_secret@github.com`;
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
    // `apm uninstall` has no -t, and narrowing `targets:` to scope a removal
    // orphans the other tools.
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

  it("fails closed when apm kept an edited file and aborted part-way", async () => {
    const { run } = fakeRun(uninstallRetainedOutput);
    const driver = new ApmCliDriver({ run });

    await expect(
      driver.removeSkill({ target: { kind: "repo", repoPath: "/repo" }, ref }),
    ).resolves.toEqual({ ok: false });
  });

  it("fails closed when the marker rides along with a not-found note", async () => {
    // apm 0.26.0 printed the marker plus a not-found note. Both must be read, or a
    // package that was never there reads as removed.
    const partial = [
      uninstallOkOutput,
      "[!] Note: 1 package(s) were not found in apm.yml",
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
      "[*] Uninstall complete: Removed 1\npackage(s) from apm.yml, Removed 1 package(s) from apm_modules/",
    );
    const { run } = fakeRun(wrapped);
    const driver = new ApmCliDriver({ run });

    await expect(
      driver.removeSkill({ target: { kind: "repo", repoPath: "/repo" }, ref }),
    ).resolves.toEqual({ ok: true });
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
    const { run } = fakeRun(versionsTableOutput);
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
    // Each phrase alone is the whole condition (#119).
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
    // Matching these lines would read every ambiguous git error as auth (#119).
    const { run } = rejectingRun({ stderr: viewNonAuthNoise });
    const driver = new ApmCliDriver({ run });

    expect(await driver.resolveLatestTag("fimoklei/agent-harness")).toEqual({
      ok: false,
      reason: "failed",
    });
  });
});

describe("ApmCliDriver.checkOutdated", () => {
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
