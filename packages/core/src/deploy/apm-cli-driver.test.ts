import { describe, expect, it } from "vitest";
import { ApmCliDriver } from "./apm-cli-driver";

// The driver shells out via an injected `run` (promisify(execFile) in
// production). These tests pin the command construction and output
// classification without spawning a process: refs and flags are data passed as
// an args array (security.md), and every apm signal is a captured fixture
// replayed through `run` (inlined so the pure lane stays free of file I/O — the
// full files live in tests/fixtures/).
type RunCall = { file: string; args: string[]; cwd?: string };

// Captured stdout of a successful `apm install ... -t claude` (apm 0.20.0). The
// positive success marker `Installed 1 APM dependency` is what deploySkill keys
// on — apm exits 0 even on a failed install, so the exit code cannot be trusted.
const installOkOutput = [
  "[*] Created apm.yml",
  "[*] Validating 1 package...",
  "[+] fimoklei/agent-harness/skills/tdd#v0.5.0",
  "[*] Updated apm.yml with 1 new package(s)",
  "[>] Installing 1 new package...",
  "  [+] github.com/fimoklei/agent-harness/skills/tdd#v0.5.0 #v0.5.0 @ec491f15",
  "  |-- Skill integrated -> .claude/skills/",
  "[i] Added apm_modules/ to .gitignore",
  "",
  "[*] Installed 1 APM dependency in 10.4s.",
].join("\n");

// Captured stdout of a failed `apm install` (apm 0.20.0): every probe failed, no
// lockfile written — yet apm still exits 0. No `Installed N APM dependency`
// marker, so deploySkill must treat it as a failure.
const installProbesFailedOutput = [
  "[*] Created apm.yml",
  "[*] Validating 1 package...",
  "[x] github.com/fimoklei/agent-harness/skills/tdd#v0.5.0 -- all probes failed",
  "All packages failed validation. Nothing to install.",
  "[!] Install interrupted after 2.8s.",
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
// destination is a symlink, on apm 0.20.0 (2026-07-19). 0.26.0 no longer prints
// this shape — see installRefusedWithoutMarkerOutput below for the current one —
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

// A captured `apm view ... versions` table with a deployable tag.
const versionsTableOutput = [
  "┃ Name   ┃ Type   ┃ Commit   ┃",
  "│ v0.5.1 │ tag    │ 471c4b26 │",
  "│ v0.5.0 │ tag    │ ec491f15 │",
  "│ main   │ branch │ 41ecfe81 │",
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

  it("reports a generic failure when apm exits 0 but the success marker is absent", async () => {
    // apm install exits 0 even on a failed install (all probes failed, nothing
    // written). Fail-closed: no positive `Installed N APM dependency` marker
    // means the install did not happen, so a failed install is never reported as
    // success (issue #119).
    const { run } = fakeRun(installProbesFailedOutput);
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

  it("reports a failure when the success marker comes with an error count", async () => {
    // apm 0.20.0 prints `Installed 1 APM dependency ... with 1 error(s)` on a
    // refused install. The marker alone would read that as a deployed skill, so
    // success requires the marker AND no failure signal (#180).
    const withErrors = installOkOutput.replace(
      "in 10.4s.",
      "in 10.4s with 1 error(s).",
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
      "in 10.4s.",
      "in 10.4s with 1\nerror(s).",
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
    // failure carries a fixed reason and nothing else (security.md).
    const tokenBearing = `${installSymlinkRefusedOutput}\nhttps://x-access-token:ghp_secret@github.com`;
    const { run } = rejectingRun({ stdout: tokenBearing });
    const driver = new ApmCliDriver({ run });

    const result = await driver.deploySkill({
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
