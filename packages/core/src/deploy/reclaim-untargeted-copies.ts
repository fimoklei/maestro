// One owner for clearing global copies apm left for a tool this machine does
// not have — the rule cannot drift between the deploy and remove callers.
// See ADR-0011, ADR-0013, #136, #339.
import type { DeployedCleanupPort, DeployTarget } from "./deploy-skill";
import { reclaimableUntargetedTools, type SupportedTool } from "./deploy-tools";

// The deploy path's entry: it knows only which tools the machine has, so the
// rule picks the leftovers for it.
export async function reclaimUntargetedCopies(input: {
  cleanup: DeployedCleanupPort;
  target: DeployTarget;
  name: string;
  // Undefined on the per-repo path, where nothing is ever reclaimed.
  detected: readonly SupportedTool[] | undefined;
}): Promise<void> {
  if (input.detected === undefined) {
    return;
  }
  await reclaimTools({
    ...input,
    tools: reclaimableUntargetedTools(input.detected),
  });
}

// The remove path's entry: tools come from the consent the user gave, never
// re-derived here — two derivations can drift apart (#390).
export async function reclaimTools(input: {
  cleanup: DeployedCleanupPort;
  target: DeployTarget;
  name: string;
  tools: readonly SupportedTool[];
}): Promise<void> {
  if (input.tools.length === 0) {
    return;
  }
  // Best-effort by design: the caller's action already succeeded, so a failed
  // reclaim must not invert it. The next global write retries it (#136).
  try {
    await input.cleanup.removeSkillTargets({
      target: input.target,
      name: input.name,
      tools: input.tools,
    });
  } catch {
    // Intentionally ignored — see above.
  }
}
