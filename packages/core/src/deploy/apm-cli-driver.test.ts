import { describe, expect, it } from "vitest";
import { ApmCliDriver } from "./apm-cli-driver";

// The driver shells out via an injected `run` (promisify(execFile) in
// production). These tests pin the command construction and output
// classification without spawning a process: refs and flags are data passed as
// an args array (security.md), and each apm signal is a captured fixture
// replayed through `run` (inlined so the pure lane stays free of file I/O). Each
// constant names its capture below; all but the 0.20.0 refusal have a full file
// in tests/fixtures/. One test feeds synthetic output instead, and says so —
// it guards a branch no current apm dialect reaches.
type RunCall = { file: string; args: string[]; cwd?: string };

// The closing summary line of a successful install. Named so the tests that
// mutate it into a failure summary cannot silently no-op when the capture is
// refreshed and the timing changes.
const INSTALL_OK_SUMMARY = "[*] Installed 1 APM dependency in 3.8s.";

// Excerpt of a successful `apm install ... -t claude` on apm 0.26.0 (2026-07-20;
// full capture in tests/fixtures/apm-install-ok.txt, whose clone-retry lines are
// dropped here as they carry no signal). The positive marker `Installed 1 APM
// dependency` is what deploySkill keys on, so success never rests on the exit
// code alone.
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

// Captured output of a same-ref re-install on apm 0.26.0 (2026-08-20; full
// capture in tests/fixtures/apm-install-no-changes.txt). Nothing changed, so
// apm prints its no-op summary and never the `Installed N APM dependenc`
// marker — a success the marker check alone reads as a failure.
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

// Captured output of a failed `apm install` on apm 0.26.0 (2026-07-20; full
// capture in tests/fixtures/apm-install-probes-failed.txt): every probe failed,
// nothing written, exit 1. It carries no `Installed N APM dependency` marker and
// none of the failure signals, so only the absent marker makes it a failure.
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

// Captured output of `apm view ... versions` under missing GitHub auth (exit 1),
// faithful to tests/fixtures/apm-view-auth-failed.txt — it carries apm's two
// fixed auth phrases (Authentication failed / No token available) AND the noise
// the allowlist must ignore: the env-hint line and the git passthrough
// `could not read Username`. Used both to classify auth-required and to prove
// the passthrough noise never triggers it (see viewNonAuthNoise below).
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

// The same apm error stripped of the two fixed phrases: only the env hint and
// the git passthrough line remain. These lines must never classify as auth —
// they carry no fixed phrase (auth-only scope, #119).
const viewNonAuthNoise = [
  "Set GITHUB_APM_PAT or GITHUB_TOKEN, or run 'gh auth login'.",
  "  stderr: 'fatal: could not read Username for 'https://github.com': terminal",
  "prompts disabled'",
].join("\n");

// Captured stdout of an `apm install ... -g -t claude` refused because the skill
// destination is a symlink, on apm 0.20.0 (2026-07-19). This one has no file in
// tests/fixtures/: the 0.26.0 refresh overwrote that capture with the shape
// below, so this constant is the only surviving record of the 0.20.0 dialect and
// cannot be re-verified without downgrading apm. 0.26.0 no longer prints this
// shape — see installRefusedWithoutMarkerOutput below for the current one —
// but the trap it guards is the reason the classifier ignores the exit code: apm
// printed the positive `Installed 1 APM dependency` marker (with an `error(s)`
// suffix) on a failed install. Rich wraps the refusal phrase across a line
// break, so `is a symlink` only matches after whitespace normalization.
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

// The same refusal without the success marker — the shape apm 0.26.0 actually
// prints (captured 2026-07-20 against a sandbox HOME whose
// ~/.claude/skills/tdd was a symlink; full capture in
// tests/fixtures/apm-install-symlink-refused.txt). 0.26.0 dropped the
// misleading positive marker: it exits 1 with an `Installation failed` line and
// no `Installed N APM dependenc`. Rich still wraps the refusal phrase, now
// splitting it as `is a` / `symlink`, so whitespace normalization stays
// load-bearing.
const installRefusedWithoutMarkerOutput = [
  "  [x] 1 package failed:",
  "    +- fimoklei/agent-harness/skills/tdd -- Failed to integrate primitives from ",
  "cached package: Skill destination /tmp/apm-fx-symlink/.claude/skills/tdd is a ",
  "symlink -- refusing to deploy",
  "[x] Installation failed with 1 error(s) in 3.4s. No install transaction changes ",
  "were committed.",
].join("\n");

// The closing summary line of a successful uninstall. Named so the wrapping test
// cannot silently no-op if the capture is refreshed.
const UNINSTALL_OK_SUMMARY =
  "[*] Uninstall complete: Removed 1 package(s) from apm.yml, Removed 1 package(s) from apm_modules/";

// Captured `apm uninstall -v <ref>` on apm 0.29.0 (2026-09-04, issue #772; full
// capture in tests/fixtures/apm-uninstall-ok.txt, whose sandbox-absolute
// `Updated .../apm.yml` line is dropped here). The `Cleaned N stale files`
// count is kept in shape but nothing keys on it — it counts what that run
// deleted (apm-behavior.md § Remove).
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

// Captured `apm uninstall <ref>` against a repo the package is not in (apm
// 0.29.0, 2026-09-04; full capture in tests/fixtures/apm-uninstall-not-found.txt).
// Exit 1, no success marker — the shape that must never read as a removal.
const uninstallNotFoundOutput = [
  "[>] Uninstalling 1 package(s)...",
  "[x] github.com/fimoklei/agent-harness/skills/tdd#v0.5.1 was not found in apm.yml. Run 'apm deps list' and retry with an installed package identifier.",
  "[x] Uninstall aborted: 1 requested package(s) could not be selected. Resolve the errors above and retry; no changes were made.",
].join("\n");

// Captured `apm uninstall -v <ref>` over a copy with one deployed file edited
// (apm 0.29.0, 2026-09-04; full capture in
// tests/fixtures/apm-uninstall-retained.txt). Exit 1, no success marker: apm
// kept the edited file, deleted the other twelve, and left the package in
// apm.yml and the lockfile (apm-behavior.md § Remove).
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

// Rows from a captured `apm view ... versions` table with a deployable tag (apm
// 0.26.0, 2026-07-20; full capture in tests/fixtures/apm-view-versions.txt).
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

// A `run` that rejects the way promisify(execFile) does on a non-zero exit: the
// error carries stdout/stderr. The driver must classify on that content without
// ever logging it (security.md).
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

  it("installs globally with -g from the prepared scratch cwd", async () => {
    // A global install adds -g and runs from a neutral scratch dir, because apm
    // appends apm_modules/ to the cwd's .gitignore even for -g — never a real
    // repo (apm-driver.md, J07).
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
    // The driver must never default a global install to every tool: a tool-less
    // (or misused) global call throws rather than writing the dead .agents/ tree
    // ADR-0011 forbids. DeploySkill refuses upstream, so this is a loud backstop.
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
    // ADR-0011: a global install targets only the detected tools. A Claude-only
    // machine gets -t claude, so apm writes no dead .agents/ tree (#131).
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
    // Presence scoping is the global path only (#131); a stray tools value must
    // not narrow a repo install, which always targets every DEPLOY_TOOLS tool.
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
    // Deliberately NOT an apm 0.26.0 shape — 0.26.0 exits 1 on every observed
    // failure, so this output is synthetic. It pins the marker check itself,
    // which stays as fail-closed insurance against a future dialect that
    // resolves without installing (#119). Nothing else covers that branch: the
    // error-count tests all supply the marker, so a refactor that trusted every
    // resolved run would pass without this.
    const { run } = fakeRun("[*] Created apm.yml\nNothing to install.");
    const driver = new ApmCliDriver({ run });

    await expect(
      driver.deploySkill({ target: { kind: "repo", repoPath: "/repo" }, ref }),
    ).resolves.toEqual({ ok: false, reason: "failed" });
  });

  it("reports a generic failure when every probe failed", async () => {
    // apm 0.26.0 exits 1 with no `Installed N APM dependency` marker when all
    // probes fail and nothing is written. The message names no diagnosed cause,
    // so it stays the generic failure rather than masquerading as one (#183).
    const { run } = rejectingRun({ stdout: installProbesFailedOutput });
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
    // Re-installing the same ref over an unchanged copy prints the no-op
    // summary instead of the install marker, so fail-closed alone turned every
    // re-deploy into "The deploy could not be completed".
    const { run } = fakeRun(installNoChangesOutput);
    const driver = new ApmCliDriver({ run });

    await expect(
      driver.deploySkill({ target: { kind: "repo", repoPath: "/repo" }, ref }),
    ).resolves.toEqual({ ok: true });
  });

  it("reports a failure when the success marker comes with an error count", async () => {
    // apm 0.20.0 printed `Installed 1 APM dependency ... with 1 error(s)` on a
    // refused install; 0.26.0 prints no marker at all. The marker alone would
    // read the 0.20.0 shape as a deployed skill, so success requires the marker
    // AND no failure signal — kept as regression insurance (#180).
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
    // Rich wraps mid-sentence at the ambient terminal width, and the install
    // path pins no COLUMNS. A summary broken as `... with 1` / `error(s).` must
    // still read as a failure — otherwise the marker stands alone and the
    // false-success hole this fix closes reopens at narrow widths (#180).
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
    // Exit 1, marker present, phrase wrapped across a line break.
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
    // The failed-install output may carry a token-bearing URL; the reported
    // failure carries a fixed reason and nothing else (security.md). Fed the
    // 0.26.0 refusal shape — the one production actually meets today.
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
    // `apm uninstall` has no -t: removal spans every tool in the consumer's
    // apm.yml targets (apm-behavior.md § Remove). Passing one would be an error,
    // and narrowing targets: to scope a removal orphans the other tools
    // (ADR-0013), so the command surface is deliberately this small.
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
    // Every uninstall outcome exits 0, including a package that was never
    // installed. Without the marker this is a failure, never a clean removal
    // (apm-behavior.md § Remove).
    const { run } = fakeRun(uninstallNotFoundOutput);
    const driver = new ApmCliDriver({ run });

    await expect(
      driver.removeSkill({ target: { kind: "repo", repoPath: "/repo" }, ref }),
    ).resolves.toEqual({ ok: false });
  });

  it("fails closed when apm kept an edited file and aborted part-way", async () => {
    // The abort prints no success marker, and the lockfile still carries the
    // package — so nothing here may read as a removal, whatever was deleted.
    const { run } = fakeRun(uninstallRetainedOutput);
    const driver = new ApmCliDriver({ run });

    await expect(
      driver.removeSkill({ target: { kind: "repo", repoPath: "/repo" }, ref }),
    ).resolves.toEqual({ ok: false });
  });

  it("fails closed when the marker rides along with a not-found note", async () => {
    // apm 0.26.0's partial success printed the success marker AND a trailing
    // not-found note; 0.29.0 aborts the whole run instead, and the guard stays
    // fail-closed for both dialects. Both markers must be read, not just the
    // first — otherwise a package that was never there reads as removed.
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
    // Only the argument parser exits non-zero (missing PACKAGES, exit 2), and it
    // touches nothing. A rejected run is classified from its own output, so it
    // can never read as a removal.
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
    // The captured failure carries both phrases at once, but each stands alone:
    // one phrase present is the whole condition, never half of it (#119).
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
    // Network down, host unreachable, CLI missing — anything that is not one of
    // apm's two auth phrases stays the generic failure (issue #119: auth-only
    // scope).
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
    // The allowlist matches only apm's two fixed phrases. The env-hint line and
    // the git `could not read Username` passthrough are noise on the same error;
    // on their own they must stay the generic failure, or a future match on them
    // would false-positive every ambiguous git error as auth (#119).
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
