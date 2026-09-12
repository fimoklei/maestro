// Server-state hook for the global deploy-state (no path — server resolves its
// own location). Exposes both the per-tool `tools` grouping (#132) and a
// flattened `primitives` list for callers that predate it.
import { useQuery } from "@tanstack/react-query";
import { requestJson } from "../api/http";
import type {
  DeployedPrimitive,
  PinnedPerSkill,
  ReleaseHead,
  SkippedEntry,
} from "./use-deploy-state";

export type ToolDeployState = {
  tool: string;
  primitives: DeployedPrimitive[];
  // Absent where the target follows no single release (ADR-0031).
  releaseHead?: ReleaseHead;
  // Absent unless this tool still holds per-skill dependencies (#950).
  pinnedPerSkill?: PinnedPerSkill;
  // Absent where this tool's subtree holds no file outside the selection.
  extraFiles?: number;
};

// Not Zod-validated here (architecture.md — that's the server's job): `tools`
// is defaulted once in `select`. Present-but-empty means "detected zero
// tools"; absent means "not read yet".
type GlobalDeployStateResponse = {
  tools?: ToolDeployState[];
  skipped: SkippedEntry[];
  // Repos named on a lockfile entry no detected tool's prefix covers (#655).
  otherOrigins?: string[];
};

export type GlobalDeployStateView = {
  tools: ToolDeployState[];
  // For the deploy picker's Global option (#134): undefined until resolved,
  // empty once resolved means no supported tool.
  detectedTools: string[] | undefined;
  primitives: DeployedPrimitive[];
  skipped: SkippedEntry[];
  otherOrigins: string[];
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
        otherOrigins: data.otherOrigins ?? [],
      };
    },
    enabled,
  });
}

// Dedupe by name+version, preserving first-seen order.
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
