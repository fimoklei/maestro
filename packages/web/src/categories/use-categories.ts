import type {
  CategoryList,
  CopyMode,
  CopyPreview,
  HarnessCategories,
  PrimitiveRef,
} from "@maestro/core";
import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { requestJson } from "../api/http";

const CATEGORIES_KEY = ["categories"] as const;

export function useCategories() {
  return useCategoriesWhile(true);
}

/** The categories query, read only while `enabled`, as while a dialog is open. */
export function useCategoriesWhile(enabled: boolean) {
  return useQuery({
    queryKey: CATEGORIES_KEY,
    queryFn: () => requestJson<CategoryList>("/api/categories"),
    enabled,
  });
}

const HARNESS_KEY = [...CATEGORIES_KEY, "harness"] as const;

/** What the latest Harness release holds of the Harness categories, and whether it changed since the operator last saw it. */
export function useHarnessCategories() {
  return useQuery({
    queryKey: HARNESS_KEY,
    queryFn: () => requestJson<HarnessCategories>("/api/categories/harness"),
  });
}

/** The dot's condition: a release changed the Harness categories. */
export function useHarnessCategoriesChanged(): boolean {
  const { data } = useHarnessCategories();
  return data?.kind === "listed" && data.changed;
}

// The server recorded the release as seen, so the dot and the notice go.
const refreshSignal = (queryClient: QueryClient) =>
  queryClient.invalidateQueries({ queryKey: HARNESS_KEY, exact: true });

/**
 * What a copy of the Harness categories would do, read while the copy dialog
 * stands. Fresh every open: the release or the own list may have changed.
 * The read records the release as seen.
 */
export function useCopyPreview() {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: [...HARNESS_KEY, "preview"],
    queryFn: async () => {
      const preview = await requestJson<CopyPreview>(
        "/api/categories/harness/preview",
        { method: "POST", body: JSON.stringify({}) },
      );
      void refreshSignal(queryClient);
      return preview;
    },
    gcTime: 0,
    staleTime: 0,
  });
}

/** The server recomputes the copy from the release as it stands on confirm. */
export function useCopyHarnessCategories() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (mode: CopyMode) =>
      requestJson<CategoryList>("/api/categories/harness/copy", {
        method: "POST",
        body: JSON.stringify({ mode }),
      }),
    onSuccess: (list) => {
      queryClient.setQueryData(CATEGORIES_KEY, list);
      void refreshSignal(queryClient);
    },
  });
}

type Added = CategoryList & { added: string };

/** Every write answers the whole list, so the cache takes it as it is. */
export function useAddCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      requestJson<Added>("/api/categories", {
        method: "POST",
        body: JSON.stringify({ name }),
      }),
    onSuccess: ({ added: _added, ...list }) => {
      queryClient.setQueryData(CATEGORIES_KEY, list);
    },
  });
}

export function useRenameCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (rename: { from: string; to: string }) =>
      requestJson<CategoryList>("/api/categories/rename", {
        method: "POST",
        body: JSON.stringify(rename),
      }),
    onSuccess: (list) => {
      queryClient.setQueryData(CATEGORIES_KEY, list);
    },
  });
}

export type CategoryDeletion = {
  name: string;
  /** Where its items go; null takes them out of every category. */
  moveTo: string | null;
};

export function useDeleteCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (deletion: CategoryDeletion) =>
      requestJson<CategoryList>("/api/categories/delete", {
        method: "POST",
        body: JSON.stringify(deletion),
      }),
    onSuccess: (list) => {
      queryClient.setQueryData(CATEGORIES_KEY, list);
    },
  });
}

export type CategoryAssignment = {
  items: PrimitiveRef[];
  /** Null takes the items out of every category. */
  category: string | null;
};

export function useAssignCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (assignment: CategoryAssignment) =>
      requestJson<CategoryList>("/api/categories/assign", {
        method: "POST",
        body: JSON.stringify(assignment),
      }),
    onSuccess: (list) => {
      queryClient.setQueryData(CATEGORIES_KEY, list);
    },
  });
}

/** The one category every item shares: null for none, undefined where they differ. */
export function sharedCategory(
  assignments: CategoryList["assignments"],
  items: readonly PrimitiveRef[],
): string | null | undefined {
  const of = (item: PrimitiveRef) =>
    assignments.find(
      (each) => each.type === item.type && each.name === item.name,
    )?.category ?? null;
  const [first, ...rest] = items.map(of);
  if (first === undefined) return undefined;
  return rest.every((each) => each === first) ? first : undefined;
}
