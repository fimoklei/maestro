// One owner for "clear the global copies apm left for a tool this machine does
// not have". Both write paths need it, for the same reason and with the same
// consequence:
//
// - A global deploy narrows its `-t` to the detected tools, and apm keeps the
//   untargeted tool's files and lockfile hashes (measured: docs/apm-behavior.md
//   § "Narrowed targets: orphans the other tools"; ADR-0011, #136).
// - A global remove scopes its deletion by the consumer's own apm.yml
//   `targets:` — the same measurement, taken on the per-repo path — so a tool
//   that has dropped off this machine keeps its copy. Inferred for the global
//   path, which runs the same scope resolution but was not separately measured
//   (#339); the reclaim is a force-rm of an exact subtree, so the inference
//   costs a no-op if it is wrong.
//
// Written once so the rule — which tools qualify, and that failing to reclaim
// is never an error — cannot drift between the two callers.
import type { DeployedCleanupPort, DeployTarget } from "./deploy-skill";
import { reclaimableUntargetedTools, type SupportedTool } from "./deploy-tools";

export async function reclaimUntargetedCopies(input: {
  cleanup: DeployedCleanupPort;
  target: DeployTarget;
  name: string;
  // The tools this machine has, from the live probe. Undefined on the per-repo
  // path, whose targets are the repo's own apm.yml rather than this machine —
  // nothing is reclaimed there.
  detected: readonly SupportedTool[] | undefined;
}): Promise<void> {
  if (input.detected === undefined) {
    return;
  }
  const leftovers = reclaimableUntargetedTools(input.detected);
  if (leftovers.length === 0) {
    return;
  }
  // Best-effort by design. The caller's own action already succeeded, so a
  // reclaim that fails must not invert it: what stays behind is a tree no worse
  // than before, which the next global write retries idempotently (force-rm).
  // Swallowed rather than surfaced because neither use-case has a logging
  // channel (#136).
  try {
    await input.cleanup.removeSkillTargets({
      target: input.target,
      name: input.name,
      tools: leftovers,
    });
  } catch {
    // Intentionally ignored — see above.
  }
}
