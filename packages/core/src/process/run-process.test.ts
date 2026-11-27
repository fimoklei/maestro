import { describe, expect, it } from "vitest";
import {
  createProcessRunner,
  ProcessFailedError,
  stdoutOf,
} from "./run-process";

const OPTIONS = { env: {}, timeout: 1_000 };

const rejecting = (thrown: unknown) =>
  createProcessRunner(() => Promise.reject(thrown));

describe("createProcessRunner", () => {
  it("returns the output of a run that succeeds", async () => {
    const run = createProcessRunner(async (file, args) => ({
      stdout: `${file} ${args.join(" ")}`,
      stderr: "warning: printed beside the answer",
    }));

    await expect(run("git", ["status"], OPTIONS)).resolves.toEqual({
      ok: true,
      stdout: "git status",
      stderr: "warning: printed beside the answer",
    });
  });

  it("reports a binary that is not installed as missing", async () => {
    const run = rejecting(
      Object.assign(new Error("spawn gh ENOENT"), { code: "ENOENT" }),
    );

    await expect(run("gh", [], OPTIONS)).resolves.toEqual({
      ok: false,
      failure: "missing",
      stdout: "",
      stderr: "",
    });
  });

  it("reports a run the timeout cut off as killed, with what it printed", async () => {
    const run = rejecting(
      Object.assign(new Error("timed out"), {
        killed: true,
        code: null,
        stdout: "Fetching origin",
        stderr: "fatal: unable to access",
      }),
    );

    await expect(run("git", [], OPTIONS)).resolves.toEqual({
      ok: false,
      failure: "killed",
      stdout: "Fetching origin",
      stderr: "fatal: unable to access",
    });
  });

  it("reports a run cut off for printing too much as a failure, not a timeout", async () => {
    const run = rejecting(
      Object.assign(new Error("stdout maxBuffer length exceeded"), {
        code: "ERR_CHILD_PROCESS_STDIO_MAXBUFFER",
        killed: true,
        stderr: "",
      }),
    );

    await expect(run("git", [], OPTIONS)).resolves.toEqual({
      ok: false,
      failure: "failed",
      exitCode: null,
      stdout: "",
      stderr: "",
    });
  });

  it("reports a non-zero exit with its exit code and stderr", async () => {
    const run = rejecting(
      Object.assign(new Error("git failed"), {
        code: 1,
        killed: false,
        stdout: "[x] Installation failed",
        stderr: "fatal: not a git repository",
      }),
    );

    await expect(run("git", [], OPTIONS)).resolves.toEqual({
      ok: false,
      failure: "failed",
      exitCode: 1,
      stdout: "[x] Installation failed",
      stderr: "fatal: not a git repository",
    });
  });

  it("reports a failure with an errno code other than ENOENT without an exit code", async () => {
    const run = rejecting(
      Object.assign(new Error("spawn git EACCES"), { code: "EACCES" }),
    );

    await expect(run("git", [], OPTIONS)).resolves.toEqual({
      ok: false,
      failure: "failed",
      exitCode: null,
      stdout: "",
      stderr: "",
    });
  });

  it("reads output a buffered run printed as text", async () => {
    const run = rejecting(
      Object.assign(new Error("git failed"), {
        code: 128,
        stdout: Buffer.from("partial"),
        stderr: Buffer.from("fatal: bad object"),
      }),
    );

    await expect(run("git", [], OPTIONS)).resolves.toEqual({
      ok: false,
      failure: "failed",
      exitCode: 128,
      stdout: "partial",
      stderr: "fatal: bad object",
    });
  });

  it.each([
    ["a string", "boom", null],
    ["null", null, null],
    ["a plain object with a numeric code", { code: 2, stderr: 7 }, 2],
  ])(
    "reads %s thrown in place of a process error as a failure",
    async (_, thrown, exitCode) => {
      await expect(rejecting(thrown)("git", [], OPTIONS)).resolves.toEqual({
        ok: false,
        failure: "failed",
        exitCode,
        stdout: "",
        stderr: "",
      });
    },
  );
});

describe("stdoutOf", () => {
  it("returns the output of a run that succeeds", () => {
    expect(stdoutOf({ ok: true, stdout: "abc\n", stderr: "" })).toBe("abc\n");
  });

  it("throws a failed run with its outcome", () => {
    const outcome = {
      ok: false,
      failure: "killed",
      stdout: "",
      stderr: "",
    } as const;

    expect(() => stdoutOf(outcome)).toThrow(
      expect.objectContaining({ outcome }),
    );
    expect(() => stdoutOf(outcome)).toThrow(ProcessFailedError);
  });
});
