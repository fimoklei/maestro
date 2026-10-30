import type { CategoryList } from "@maestro/core";
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
