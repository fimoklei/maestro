// The one owner of what a landed removal says. A removal deletes files and then
// takes its own row off the screen, so absence is the only evidence left — this
// turns it into a sentence that names what went and where it went from, in the
// same shape the deploy path already confirms itself.
// Pure and framework-free: the wording is unit-tested here, the live region is
// the host's job.
import type { RemoveDialogTarget } from "./remove-skill-dialog";
import { toolNameList } from "./tool-labels";

export type RemovedSkill = {
  name: string;
  // The version as the row carried it, captured before the removal ran — after
  // it lands there is nothing left to read it from.
  version: string;
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
      : // Naming the tools keeps the trace as inspectable as the consent was.
        // An empty set falls back to the confirmation's own phrase rather than
        // trailing off (ADR-0011: the set is detected, so it can be empty).
        toolNameList(target.tools) || "every detected tool";
  return `removed ${name} ${version} from ${scope}`;
}
