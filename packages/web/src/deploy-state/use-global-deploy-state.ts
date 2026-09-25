// Exposes both the per-tool `tools` grouping and a flattened `primitives` list.
import { useQuery } from "@tanstack/react-query";
import { requestJson } from "../api/http";
import type {
  DeployedPrimitive,
  GitHubPage,
  PendingOperation,
  PinnedPerSkill,
  ReleaseHead,
  SkippedEntry,
} from "./use-deploy-state";

export type ToolDeployState = {
  tool: string;
  primitives: DeployedPrimitive[];
  releaseHead?: ReleaseHead;
  pinnedPerSkill?: PinnedPerSkill;
  extraFiles?: number;
  // Absent where the release has no page on GitHub (#1181).
  releaseGitHub?: GitHubPage;
};

// Not Zod-validated here: `tools` is defaulted once in `select`. Present-but-empty
// means "detected zero tools"; absent means "not read yet".
type GlobalDeployStateResponse = {
  tools?: ToolDeployState[];
  skipped: SkippedEntry[];
  // Repos named on a lockfile entry no detected tool's prefix covers.
  otherOrigins?: string[];
  pendingOperation?: PendingOperation;
};

export type GlobalDeployStateView = {
  tools: ToolDeployState[];
  // Undefined until resolved; empty once resolved means no supported tool.
  detectedTools: string[] | undefined;
  primitives: DeployedPrimitive[];
  skipped: SkippedEntry[];
  otherOrigins: string[];
  pendingOperation?: PendingOperation;
};

// The one other query that opts back into refetch on focus (#1037).
export function globalDeployStateQueryOptions() {
  return {
    queryKey: ["deploy-state", "global"] as const,
    queryFn: () =>
      requestJson<GlobalDeployStateResponse>("/api/deploy-state/global"),
    select: (data: GlobalDeployStateResponse): GlobalDeployStateView => {
      const tools = data.tools ?? [];
      return {
        tools,
        detectedTools: data.tools?.map((group) => group.tool),
        skipped: data.skipped,
        primitives: flattenPrimitives(tools),
        otherOrigins: data.otherOrigins ?? [],
        ...(data.pendingOperation
          ? { pendingOperation: data.pendingOperation }
          : {}),
      };
    },
    refetchOnWindowFocus: true,
  };
}

export function useGlobalDeployState(enabled = true) {
  return useQuery({ ...globalDeployStateQueryOptions(), enabled });
}

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
