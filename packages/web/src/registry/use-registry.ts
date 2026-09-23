// Every write invalidates the list so the screen refetches (frontend.md).
import type { RepoStatus } from "@maestro/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { requestJson } from "../api/http";

export type RegisteredRepo = { path: string };

// What a write answers: the list as stored, without readings.
type StoredRepos = { repos: RegisteredRepo[] };

export type RegistryResponse = {
  repos: (RegisteredRepo & { status: RepoStatus })[];
};

export const REGISTRY_KEY = ["registry", "repos"] as const;

export function useRegistry() {
  return useQuery({
    queryKey: REGISTRY_KEY,
    queryFn: () => requestJson<RegistryResponse>("/api/registry/repos"),
  });
}

/** Every refusal a registration would give, with nothing written (#1009). */
export function useCheckRepo() {
  return useMutation({
    mutationFn: (path: string) =>
      requestJson<{ path: string }>("/api/registry/repos/check", {
        method: "POST",
        body: JSON.stringify({ path }),
      }),
  });
}

export function useRegisterRepo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (path: string) =>
      requestJson<StoredRepos>("/api/registry/repos", {
        method: "POST",
        body: JSON.stringify({ path }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: REGISTRY_KEY });
    },
  });
}

export function useUnregisterRepo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (path: string) =>
      requestJson<StoredRepos>("/api/registry/repos", {
        method: "DELETE",
        body: JSON.stringify({ path }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: REGISTRY_KEY });
    },
  });
}
