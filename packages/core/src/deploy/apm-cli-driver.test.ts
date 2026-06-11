import { describe, expect, it } from "vitest";
import { ApmCliDriver } from "./apm-cli-driver";

// The driver shells out via an injected `run` (promisify(execFile) in
// production). These tests pin the command construction without spawning a
// process: refs and flags are data passed as an args array (security.md).
type RunCall = { file: string; args: string[]; cwd?: string };

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

describe("ApmCliDriver.deploySkill", () => {
  it("installs the ref targeting both claude and codex in one action", async () => {
    const { run, calls } = fakeRun();
    const driver = new ApmCliDriver({ run });

    await driver.deploySkill({
      repoPath: "/repo",
      ref: "github.com/fimoklei/agent-harness/skills/tdd#v0.5.1",
    });

    expect(calls).toEqual([
      {
        file: "apm",
        args: [
          "install",
          "github.com/fimoklei/agent-harness/skills/tdd#v0.5.1",
          "-t",
          "claude,codex",
        ],
        cwd: "/repo",
      },
    ]);
  });
});
