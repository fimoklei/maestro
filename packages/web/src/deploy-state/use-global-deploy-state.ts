// Global as one target: its skill list, its release and the folders it writes.
import type {
  GlobalTargetState,
  PendingOperation,
  SkippedEntry,
  SupportedTool,
} from "@maestro/core";
import { useQuery } from "@tanstack/react-query";
import { requestJson } from "../api/http";
import { DEPLOY_STATE_KEY } from "./use-deploy-state";

// Not Zod-validated here: `folders` is defaulted once in `select`.
type GlobalDeployStateResponse = Omit<GlobalTargetState, "folders"> & {
  folders?: GlobalTargetState["folders"];
  skipped: SkippedEntry[];
  // Repos named on a lockfile entry no detected tool's prefix covers.
  otherOrigins?: string[];
  pendingOperation?: PendingOperation;
};

export type GlobalDeployStateView = GlobalTargetState & {
  /** The tools whose folders Global writes; empty: none detected. */
  detectedTools: SupportedTool[];
  skipped: SkippedEntry[];
  otherOrigins: string[];
  pendingOperation?: PendingOperation;
};

export function globalDeployStateQueryOptions() {
  return {
    queryKey: [...DEPLOY_STATE_KEY, "global"] as const,
    queryFn: () =>
      requestJson<GlobalDeployStateResponse>("/api/deploy-state/global"),
    select: (data: GlobalDeployStateResponse): GlobalDeployStateView => {
      const folders = data.folders ?? [];
      return {
        ...data,
        primitives: data.primitives ?? [],
        folders,
        detectedTools: folders
          .filter((folder) => folder.detected)
          .map((folder) => folder.tool),
        otherOrigins: data.otherOrigins ?? [],
      };
    },
  };
}

export function useGlobalDeployState(enabled = true) {
  return useQuery({ ...globalDeployStateQueryOptions(), enabled });
}
