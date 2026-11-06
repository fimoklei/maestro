// The target and skill names travel; the server resolves every folder (#1249).
import type { ImportLocalEditsInput, LocalEditsSkill } from "@maestro/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { requestJson } from "../api/http";
import { HARNESS_QUERIES } from "../harness/use-harness";
import {
  type DeployTarget,
  targetQueryKey,
} from "../inventory/use-deploy-skill";

// Read-only despite the POST. Fresh every open, as the update preview is.
const localEditsCheck = (target: DeployTarget) => ({
  queryKey: ["import-local-edits", targetQueryKey(target)] as const,
  queryFn: () =>
    requestJson<{ skills: LocalEditsSkill[] }>(
      "/api/deploy/import-local-edits/check",
      { method: "POST", body: JSON.stringify({ target }) },
    ),
  gcTime: 0,
  staleTime: 0,
});

export function useLocalEditsCheck(target: DeployTarget) {
  return useQuery(localEditsCheck(target));
}

/**
 * The skills folders of each skill whose edited copies differ, one entry per
 * distinct set; empty while the check runs or where it is not `enabled`.
 */
export function useDifferingCopyFolders(
  target: DeployTarget,
  enabled: boolean,
): string[][] {
  const check = useQuery({ ...localEditsCheck(target), enabled });
  const sets = new Map<string, string[]>();
  for (const { name, folders } of check.data?.skills ?? []) {
    if (folders === undefined) continue;
    const parents = folders.map((folder) => {
      const cut = folder.lastIndexOf("/");
      return folder.slice(cut + 1) === name ? folder.slice(0, cut) : folder;
    });
    sets.set(parents.join("\n"), parents);
  }
  return [...sets.values()];
}

// Invalidated whatever the answer: a partial run changed the Harness too.
export function useImportLocalEdits() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: ImportLocalEditsInput) =>
      requestJson<{ outcomes: LocalEditsSkill[] }>(
        "/api/deploy/import-local-edits",
        { method: "POST", body: JSON.stringify(request) },
      ),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: HARNESS_QUERIES }),
  });
}
