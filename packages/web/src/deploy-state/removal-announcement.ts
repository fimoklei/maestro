// What a landed removal says, since the row itself is gone by then. Pure and
// framework-free: wording is unit-tested here, the live region is the host's job.
import type { RemoveDialogTarget } from "./remove-ledger-rows";
import { toolNameList } from "./tool-labels";

export type RemovedSkill = {
  name: string;
  // Undefined only when the response carried none (server the cockpit doesn't
  // match) — the sentence says so rather than printing a placeholder (#383).
  version: string | undefined;
  // As the server resolved it, not as the screen had it — the detected tool
  // set is probed at execution time and can differ from what was confirmed.
  target: RemoveDialogTarget;
};

export function removalAnnouncement({
  name,
  version,
  target,
}: RemovedSkill): string {
  const scope =
    target.kind === "repo"
      ? target.repoPath
      : // The set is detected, so it can be empty (ADR-0011) — fall back rather
        // than trail off.
        toolNameList(target.tools) || "every detected tool";
  return `removed ${name} ${version ?? "(version unknown)"} from ${scope}`;
}
