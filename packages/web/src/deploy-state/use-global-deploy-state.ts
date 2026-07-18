// Server-state hook for the global (user-scope) deploy-state. The server reads
// apm's user-scope apm.lock.yaml and resolves that location itself, so this hook
// sends no path. As of #132 the API groups state per detected tool; this hook
// exposes that `tools` grouping AND a flattened `primitives` list so the
// current panel and drift roll-up keep working unchanged. Its own query key
// sits alongside the
// per-repo ones (see .claude/rules/frontend.md).
import { useQuery } from "@tanstack/react-query";
import { requestJson } from "../api/http";
import type { DeployedPrimitive, SkippedEntry } from "./use-deploy-state";

export type ToolDeployState = {
  tool: string;
  primitives: DeployedPrimitive[];
};

// This hook does not Zod-validate the wire shape (that boundary is the server —
// see .claude/rules/architecture.md), so `tools` is treated as possibly absent
// and defaulted once in `select`. A present-but-empty array is the meaningful
// "detected zero tools" signal; a fully absent array is "not read yet".
type GlobalDeployStateResponse = {
  tools?: ToolDeployState[];
  skipped: SkippedEntry[];
};

export type GlobalDeployStateView = {
  tools: ToolDeployState[];
  // The detected-tool set for the deploy picker's Global option (#134).
  // Undefined until the read resolves; an empty array once it does means the
  // machine has no supported tool. Derived here so the picker stays
  // presentational (frontend.md: hooks hold logic).
  detectedTools: string[] | undefined;
  primitives: DeployedPrimitive[];
  skipped: SkippedEntry[];
};

export function useGlobalDeployState(enabled = true) {
  return useQuery({
    queryKey: ["deploy-state", "global"],
    queryFn: () =>
      requestJson<GlobalDeployStateResponse>("/api/deploy-state/global"),
    select: (data): GlobalDeployStateView => {
      const tools = data.tools ?? [];
      return {
        tools,
        detectedTools: data.tools?.map((group) => group.tool),
        skipped: data.skipped,
        primitives: flattenPrimitives(tools),
      };
    },
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
