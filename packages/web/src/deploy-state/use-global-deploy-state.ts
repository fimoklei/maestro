// Server-state hook for the global (user-scope) deploy-state. The server reads
// apm's user-scope apm.lock.yaml and resolves that location itself, so this hook
// sends no path. As of #132 the API groups state per detected tool; this hook
// exposes that `tools` grouping AND, until the per-tool cockpit rendering lands
// (a separate ticket), a flattened `primitives` list so the current panel and
// drift roll-up keep working unchanged. Its own query key sits alongside the
// per-repo ones (see .claude/rules/frontend.md).
import { useQuery } from "@tanstack/react-query";
import { requestJson } from "../api/http";
import type { DeployedPrimitive, SkippedEntry } from "./use-deploy-state";

export type ToolDeployState = {
  tool: string;
  primitives: DeployedPrimitive[];
};

type GlobalDeployStateResponse = {
  tools: ToolDeployState[];
  skipped: SkippedEntry[];
};

export type GlobalDeployStateView = {
  tools: ToolDeployState[];
  primitives: DeployedPrimitive[];
  skipped: SkippedEntry[];
};

export function useGlobalDeployState(enabled = true) {
  return useQuery({
    queryKey: ["deploy-state", "global"],
    queryFn: () =>
      requestJson<GlobalDeployStateResponse>("/api/deploy-state/global"),
    select: (data): GlobalDeployStateView => ({
      tools: data.tools,
      skipped: data.skipped,
      primitives: flattenPrimitives(data.tools),
    }),
    enabled,
  });
}

// A skill deployed for two tools appears in each tool's group; the flat legacy
// view shows it once. Dedupe by name+version, preserving first-seen order.
function flattenPrimitives(tools: ToolDeployState[]): DeployedPrimitive[] {
  const seen = new Set<string>();
  const flat: DeployedPrimitive[] = [];
  for (const group of tools) {
    for (const primitive of group.primitives) {
      const key = `${primitive.name}@${primitive.version}`;
      if (!seen.has(key)) {
        seen.add(key);
        flat.push(primitive);
      }
    }
  }
  return flat;
}
