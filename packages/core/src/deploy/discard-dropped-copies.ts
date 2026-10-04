import type { DeployedCleanupPort, DeployTarget } from "./deploy-skill";
import { SUPPORTED_TOOLS, type SupportedTool } from "./deploy-tools";

// apm keeps an edited copy of a skill the release drops (#1340). Call only once
// the copy guard admitted the write: every dropped copy is clean or consented.
export async function discardDroppedCopies(
  cleanup: DeployedCleanupPort,
  input: {
    target: DeployTarget;
    previous: readonly string[];
    desired: readonly string[];
    // Empty is a repo install, which runs for every tool.
    tools: readonly SupportedTool[];
  },
): Promise<void> {
  const tools = input.tools.length === 0 ? SUPPORTED_TOOLS : input.tools;
  for (const name of input.previous) {
    if (!input.desired.includes(name)) {
      await cleanup.removeSkillTargets({ target: input.target, name, tools });
    }
  }
}
