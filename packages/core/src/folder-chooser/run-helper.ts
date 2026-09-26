import { execFile } from "node:child_process";
import type { RunHelper } from "./folder-chooser-port";

export const runHelper: RunHelper = (file, args, options) =>
  new Promise((resolve) => {
    execFile(
      file,
      args,
      { ...options, encoding: "utf8", maxBuffer: 64 * 1024, windowsHide: true },
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
