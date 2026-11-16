import type {
  CategoriesProposalCreated,
  CategoriesProposalPreview,
  CategoriesProposalRow,
  CategoryList,
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

/** What the latest Harness release holds of the Harness categories. */
export function useHarnessCategories() {
  return useQuery({
    queryKey: [...CATEGORIES_KEY, "harness"],
    queryFn: () => requestJson<HarnessCategories>("/api/categories/harness"),
  });
}

const PROPOSAL_KEY = [...CATEGORIES_KEY, "proposal"] as const;

/** The row Pull request to the Harness: where the categories pull request stands. */
export function useCategoriesProposal() {
  return useQuery({
    queryKey: PROPOSAL_KEY,
    queryFn: () =>
      requestJson<CategoriesProposalRow>("/api/categories/proposal"),
  });
}

/** The pull request's difference against the next release, read fresh per dialog. */
export function useCategoriesProposalPreview() {
  return useQuery({
    queryKey: [...PROPOSAL_KEY, "preview"],
    queryFn: () =>
      requestJson<CategoriesProposalPreview>(
        "/api/categories/proposal/preview",
      ),
    gcTime: 0,
  });
}

/** Create pull request; the row reads where it stands afterwards. */
export function useCreatePullRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      requestJson<CategoriesProposalCreated>("/api/categories/proposal", {
        method: "POST",
        body: "{}",
      }),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: PROPOSAL_KEY, exact: true }),
  });
}

// The row's empty state follows the list, so it is read again.
const listChanged = (queryClient: QueryClient, list: CategoryList) => {
  queryClient.setQueryData(CATEGORIES_KEY, list);
  void queryClient.invalidateQueries({ queryKey: PROPOSAL_KEY, exact: true });
};

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
      listChanged(queryClient, list);
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
      listChanged(queryClient, list);
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
      listChanged(queryClient, list);
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
      listChanged(queryClient, list);
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
