// Clears global copies apm left for a tool this machine does not have (#136).
import type { DeployedCleanupPort, DeployTarget } from "./deploy-skill";
import { reclaimableUntargetedTools, type SupportedTool } from "./deploy-tools";

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

// On removal, pass the tools from the user's consent; never re-derive them
// (#390).
export async function reclaimTools(input: {
  cleanup: DeployedCleanupPort;
  target: DeployTarget;
  name: string;
  tools: readonly SupportedTool[];
}): Promise<void> {
  if (input.tools.length === 0) {
    return;
  }
  // Best-effort: the caller's action already succeeded, so a failed reclaim
  // must not invert it. The next global write retries it.
  try {
    await input.cleanup.removeSkillTargets({
      target: input.target,
      name: input.name,
      tools: input.tools,
    });
  } catch {
    // Intentionally ignored.
  }
}
