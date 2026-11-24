import { execFile } from "node:child_process";
import { promisify } from "node:util";

export type ProcessOptions = { env: NodeJS.ProcessEnv; timeout: number };

export type RunFn = (
  file: string,
  args: string[],
  options: ProcessOptions,
) => Promise<{ stdout: string; stderr: string }>;

export type ProcessOutcome =
  | { ok: true; stdout: string }
  | { ok: false; failure: "missing"; stderr: string }
  | { ok: false; failure: "killed"; stderr: string }
  | {
      ok: false;
      failure: "failed";
      exitCode: number | null;
      stderr: string;
    };

export type ProcessFailure = Exclude<ProcessOutcome, { ok: true }>;

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
      const { stdout } = await run(file, args, options);
      return { ok: true, stdout };
    } catch (error) {
      return failureOf(error);
    }
  };
}

export const runProcess: ProcessRunner = createProcessRunner(
  promisify(execFile),
);

export function stdoutOf(outcome: ProcessOutcome): string {
  if (!outcome.ok) {
    throw new ProcessFailedError(outcome);
  }
  return outcome.stdout;
}

function failureOf(error: unknown): ProcessFailure {
  const printed = field(error, "stderr");
  const stderr = typeof printed === "string" ? printed : "";
  const code = field(error, "code");
  if (field(error, "killed") === true && code !== OUTPUT_OVERFLOW) {
    return { ok: false, failure: "killed", stderr };
  }
  if (code === "ENOENT") {
    return { ok: false, failure: "missing", stderr };
  }
  return {
    ok: false,
    failure: "failed",
    exitCode: typeof code === "number" ? code : null,
    stderr,
  };
}

function field(value: unknown, key: "code" | "killed" | "stderr"): unknown {
  return typeof value === "object" && value !== null && key in value
    ? Reflect.get(value, key)
    : undefined;
}
