import type { DeployedCleanupPort, DeployTarget } from "./deploy-skill";
import { SUPPORTED_TOOLS, type SupportedTool } from "./deploy-tools";

export async function discardDroppedCopies(
  cleanup: DeployedCleanupPort,
  input: {
    target: DeployTarget;
    previous: readonly string[];
    desired: readonly string[];
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
