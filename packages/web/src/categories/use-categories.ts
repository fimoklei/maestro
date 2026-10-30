import type { CategoryList, PrimitiveRef } from "@maestro/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { requestJson } from "../api/http";

const CATEGORIES_KEY = ["categories"] as const;

export function useCategories() {
  return useQuery({
    queryKey: CATEGORIES_KEY,
    queryFn: () => requestJson<CategoryList>("/api/categories"),
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
