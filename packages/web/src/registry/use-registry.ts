// Server-state hooks for the consuming-repo registry. The registry lives on the
// server; the screen only caches it (TanStack Query), so registering invalidates
// the query and the list refetches itself (see .claude/rules/frontend.md).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { requestJson } from "../api/http";

export type RegisteredRepo = { path: string };

type RegistryResponse = { repos: RegisteredRepo[] };

const REGISTRY_KEY = ["registry", "repos"] as const;

export function useRegistry() {
  return useQuery({
    queryKey: REGISTRY_KEY,
    queryFn: () => requestJson<RegistryResponse>("/api/registry/repos"),
  });
}

export function useRegisterRepo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (path: string) =>
      requestJson<RegistryResponse>("/api/registry/repos", {
        method: "POST",
        body: JSON.stringify({ path }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: REGISTRY_KEY });
    },
  });
}
