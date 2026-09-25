import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { NON_INTERACTIVE } from "../git/non-interactive";
import {
  type CloneFailure,
  classifyCloneFailure,
} from "./classify-clone-failure";

const run = promisify(execFile);

// The only thing that ends a stalled clone: there is no cancel control.
const CLONE_TIMEOUT_MS = 600_000;

export type CloneOutcome = "cloned" | CloneFailure;

export interface CloneRepositoryPort {
  clone(url: string, destination: string): Promise<CloneOutcome>;
}

export class GitCloneAdapter implements CloneRepositoryPort {
  async clone(url: string, destination: string): Promise<CloneOutcome> {
    try {
      // Never `--single-branch`: default-branch resolution needs every branch.
      await run("git", ["clone", "--", url, destination], {
        env: { ...process.env, ...NON_INTERACTIVE },
        timeout: CLONE_TIMEOUT_MS,
      });
      return "cloned";
    } catch (error) {
      return classifyCloneFailure((error as { stderr?: string }).stderr ?? "");
    }
  }
}
