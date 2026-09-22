import { execFile } from "node:child_process";
import type { RunHelper } from "./folder-chooser-port";

// The real process behind every chooser adapter; tests pass their own.
export const runHelper: RunHelper = (file, args, options) =>
  new Promise((resolve) => {
    execFile(
      file,
      args,
      { ...options, encoding: "utf8", maxBuffer: 64 * 1024 },
      (error, stdout, stderr) => {
        resolve({
          // A spawn failure carries a string code (ENOENT) and no exit code.
          exitCode:
            error === null
              ? 0
              : typeof error.code === "number"
                ? error.code
                : null,
          killed: error?.killed ?? false,
          stdout,
          stderr,
        });
      },
    );
  });
