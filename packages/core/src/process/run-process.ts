import { execFile } from "node:child_process";
import { promisify } from "node:util";

export type ProcessOptions = {
  env: NodeJS.ProcessEnv;
  timeout: number;
  cwd?: string;
  signal?: AbortSignal;
  maxBuffer?: number;
};

export type RunFn = (
  file: string,
  args: string[],
  options: ProcessOptions,
) => Promise<{ stdout: string; stderr: string }>;

export type ProcessFailure =
  | { ok: false; failure: "missing"; stdout: string; stderr: string }
  | { ok: false; failure: "killed"; stdout: string; stderr: string }
  | {
      ok: false;
      failure: "failed";
      exitCode: number | null;
      stdout: string;
      stderr: string;
    };

export type ProcessOutcome =
  | { ok: true; stdout: string; stderr: string }
  | ProcessFailure;

export type BytesOutcome = { ok: true; stdout: Buffer } | ProcessFailure;

export type ProcessRunner = (
  file: string,
  args: string[],
  options: ProcessOptions,
) => Promise<ProcessOutcome>;

const OUTPUT_OVERFLOW = "ERR_CHILD_PROCESS_STDIO_MAXBUFFER";

export class ProcessFailedError extends Error {
  constructor(readonly outcome: ProcessFailure) {
    super(`process ${outcome.failure}`);
    this.name = "ProcessFailedError";
  }
}

export function createProcessRunner(run: RunFn): ProcessRunner {
  return async (file, args, options) => {
    try {
      const { stdout, stderr } = await run(file, args, options);
      return { ok: true, stdout, stderr };
    } catch (error) {
      return failureOf(error);
    }
  };
}

const execFileText = promisify(execFile);

export const runProcess: ProcessRunner = createProcessRunner(
  (file, args, options) =>
    execFileText(file, args, { ...options, windowsHide: true }),
);

export function runProcessBytes(
  file: string,
  args: string[],
  options: ProcessOptions,
  input: string,
): Promise<BytesOutcome> {
  return new Promise((resolve) => {
    const child = execFile(
      file,
      args,
      { ...options, encoding: "buffer", windowsHide: true },
      (error, stdout) => {
        resolve(error === null ? { ok: true, stdout } : failureOf(error));
      },
    );
    child.stdin?.end(input);
  });
}

export function stdoutOf(outcome: ProcessOutcome): string {
  if (!outcome.ok) {
    throw new ProcessFailedError(outcome);
  }
  return outcome.stdout;
}

function failureOf(error: unknown): ProcessFailure {
  const stdout = textOf(field(error, "stdout"));
  const stderr = textOf(field(error, "stderr"));
  const code = field(error, "code");
  if (field(error, "killed") === true && code !== OUTPUT_OVERFLOW) {
    return { ok: false, failure: "killed", stdout, stderr };
  }
  if (code === "ENOENT") {
    return { ok: false, failure: "missing", stdout, stderr };
  }
  return {
    ok: false,
    failure: "failed",
    exitCode: typeof code === "number" ? code : null,
    stdout,
    stderr,
  };
}

function textOf(printed: unknown): string {
  if (typeof printed === "string") {
    return printed;
  }
  return Buffer.isBuffer(printed) ? printed.toString("utf8") : "";
}

function field(
  value: unknown,
  key: "code" | "killed" | "stdout" | "stderr",
): unknown {
  return typeof value === "object" && value !== null && key in value
    ? Reflect.get(value, key)
    : undefined;
}
