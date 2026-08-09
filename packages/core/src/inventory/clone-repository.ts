// Cloning creates a repository rather than acting inside one, so it is its own
// typed operation and not part of the in-repo git surface (#554). Git's own
// output never leaves here — an outcome is a class (ADR-0018).
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { NON_INTERACTIVE } from "../git/non-interactive";
import {
  type CloneFailure,
  classifyCloneFailure,
} from "./classify-clone-failure";

const run = promisify(execFile);

// Long enough for a real Harness over a slow line, short enough that a hung
// connection cannot hold the request open forever. There is no cancel control,
// so this is the only thing that ends a stalled clone.
const CLONE_TIMEOUT_MS = 600_000;

export type CloneOutcome = "cloned" | CloneFailure;

export interface CloneRepositoryPort {
  clone(url: string, destination: string): Promise<CloneOutcome>;
}

export class GitCloneAdapter implements CloneRepositoryPort {
  async clone(url: string, destination: string): Promise<CloneOutcome> {
    try {
      // A full clone, never `--single-branch`: the default branch is resolved
      // from what `origin/` holds, and a narrowed refspec makes that
      // unanswerable (`default-branch.ts`).
      await run("git", ["clone", "--", url, destination], {
        env: { ...process.env, ...NON_INTERACTIVE },
        timeout: CLONE_TIMEOUT_MS,
      });
      return "cloned";
    } catch (error) {
      // git's own words are read here and dropped; only the class travels.
      return classifyCloneFailure((error as { stderr?: string }).stderr ?? "");
    }
  }
}
