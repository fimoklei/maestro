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

    await driver.deploySkill({ target: { kind: "global" }, ref });

    expect(calls).toEqual([
      {
        file: "apm",
        args: ["install", ref, "-g", "-t", "claude,codex"],
        cwd: "/scratch/.apm-scratch",
      },
    ]);
  });

  it("throws when apm exits 0 but the success marker is absent", async () => {
    // apm install exits 0 even on a failed install (all probes failed, nothing
    // written). Fail-closed: no positive `Installed N APM dependency` marker
    // means the install did not happen, so a failed install is never reported as
    // success (issue #119).
    const { run } = fakeRun(installProbesFailedOutput);
    const driver = new ApmCliDriver({ run });

    await expect(
      driver.deploySkill({ target: { kind: "repo", repoPath: "/repo" }, ref }),
    ).rejects.toThrow();
  });

  it("resolves when the positive success marker is present", async () => {
    const { run } = fakeRun(installOkOutput);
    const driver = new ApmCliDriver({ run });

    await expect(
      driver.deploySkill({ target: { kind: "repo", repoPath: "/repo" }, ref }),
    ).resolves.toBeUndefined();
  });

  it("does not leak raw apm output in the failure it throws", async () => {
    // The failed-install output may carry a token-bearing URL; the thrown error
    // must not echo it (security.md).
    const tokenBearing = `${installProbesFailedOutput}\nhttps://x-access-token:ghp_secret@github.com`;
    const { run } = fakeRun(tokenBearing);
    const driver = new ApmCliDriver({ run });

    await expect(
      driver.deploySkill({ target: { kind: "repo", repoPath: "/repo" }, ref }),
    ).rejects.toThrow(expect.not.stringContaining("ghp_secret"));
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
