import { NON_INTERACTIVE } from "../git/non-interactive";
import { runProcess } from "../process/run-process";
import {
  type CloneFailure,
  classifyCloneFailure,
} from "./classify-clone-failure";

const STALLED_CLONE_TIMEOUT_MS = 600_000;

export type CloneOutcome = "cloned" | CloneFailure;

export interface CloneRepositoryPort {
  clone(url: string, destination: string): Promise<CloneOutcome>;
}

export class GitCloneAdapter implements CloneRepositoryPort {
  async clone(url: string, destination: string): Promise<CloneOutcome> {
    const outcome = await runProcess("git", ["clone", "--", url, destination], {
      env: { ...process.env, ...NON_INTERACTIVE },
      timeout: STALLED_CLONE_TIMEOUT_MS,
    });
    return outcome.ok ? "cloned" : classifyCloneFailure(outcome.stderr);
  }
}
