// The target and skill names travel; the server resolves every folder (#1249).
import type { LocalEditsSkill } from "@maestro/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { requestJson } from "../api/http";
import { HARNESS_QUERIES } from "../harness/use-harness";
import {
  type DeployTarget,
  targetQueryKey,
} from "../inventory/use-deploy-skill";

export type { LocalEditsSkill };

// Read-only despite the POST. Fresh every open, as the update preview is.
export function useLocalEditsCheck(target: DeployTarget, enabled: boolean) {
  return useQuery({
    queryKey: ["import-local-edits", targetQueryKey(target)] as const,
    queryFn: () =>
      requestJson<{ skills: LocalEditsSkill[] }>(
        "/api/deploy/import-local-edits/check",
        { method: "POST", body: JSON.stringify({ target }) },
      ),
    enabled,
    gcTime: 0,
    staleTime: 0,
  });
}

// Invalidated whatever the answer: a partial run changed the Harness too.
export function useImportLocalEdits() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: {
      target: DeployTarget;
      names: string[];
      undo: string[];
    }) =>
      requestJson<{ outcomes: LocalEditsSkill[] }>(
        "/api/deploy/import-local-edits",
        { method: "POST", body: JSON.stringify(request) },
      ),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: HARNESS_QUERIES }),
  });
}
