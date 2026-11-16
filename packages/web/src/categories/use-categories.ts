import type {
  CategoriesProposalCreated,
  CategoriesProposalPreview,
  CategoriesProposalRow,
  CategoryList,
  CopyMode,
  CopyPreview,
  HarnessCategories,
  PrimitiveRef,
} from "@maestro/core";
import {
  type QueryClient,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { requestJson } from "../api/http";

const CATEGORIES_KEY = ["categories"] as const;
const HARNESS_KEY = [...CATEGORIES_KEY, "harness"] as const;
const PROPOSAL_KEY = [...CATEGORIES_KEY, "proposal"] as const;

// The server recorded the release as seen, so the dot and the notice go.
const refreshSignal = (queryClient: QueryClient) =>
  queryClient.invalidateQueries({ queryKey: HARNESS_KEY, exact: true });

// A read that records the release as seen: a POST, fresh every open.
const seenQuery = <T>(queryClient: QueryClient, name: string, path: string) =>
  queryOptions({
    queryKey: [...HARNESS_KEY, name] as const,
    queryFn: async () => {
      const answer = await requestJson<T>(path, {
        method: "POST",
        body: JSON.stringify({}),
      });
      void refreshSignal(queryClient);
      return answer;
    },
    gcTime: 0,
    staleTime: 0,
  });

/** Every categories read, each with its key. */
const categoriesQueries = {
  list: () =>
    queryOptions({
      queryKey: CATEGORIES_KEY,
      queryFn: () => requestJson<CategoryList>("/api/categories"),
    }),
  /** What the latest Harness release holds of the Harness categories, and whether it changed since the operator last saw it. */
  harness: () =>
    queryOptions({
      queryKey: HARNESS_KEY,
      queryFn: () => requestJson<HarnessCategories>("/api/categories/harness"),
    }),
  /** The row Pull request to the Harness: where the categories pull request stands. */
  proposal: () =>
    queryOptions({
      queryKey: PROPOSAL_KEY,
      queryFn: () =>
        requestJson<CategoriesProposalRow>("/api/categories/proposal"),
    }),
  /** The pull request's difference, read fresh per dialog. */
  proposalPreview: () =>
    queryOptions({
      queryKey: [...PROPOSAL_KEY, "preview"] as const,
      queryFn: () =>
        requestJson<CategoriesProposalPreview>(
          "/api/categories/proposal/preview",
        ),
      gcTime: 0,
    }),
  /** What a copy would do, read while the copy dialog stands; records the release as seen. */
  copyPreview: (queryClient: QueryClient) =>
    seenQuery<CopyPreview>(
      queryClient,
      "preview",
      "/api/categories/harness/preview",
    ),
  /** What the Connect gate offers to copy; offering it records the release as seen. */
  offer: (queryClient: QueryClient) =>
    seenQuery<HarnessCategories>(
      queryClient,
      "offer",
      "/api/categories/harness/seen",
    ),
};

export function useCategories() {
  return useCategoriesWhile(true);
}

/** The categories query, read only while `enabled`, as while a dialog is open. */
export function useCategoriesWhile(enabled: boolean) {
  return useQuery({ ...categoriesQueries.list(), enabled });
}

export function useHarnessCategories() {
  return useQuery(categoriesQueries.harness());
}

export function useCategoriesProposal() {
  return useQuery(categoriesQueries.proposal());
}

export function useCategoriesProposalPreview() {
  return useQuery(categoriesQueries.proposalPreview());
}

/**
 * Create or Update pull request, from the preview the dialog showed, which
 * the server checks again; the row reads where it stands afterwards.
 */
export function useCreatePullRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (previewed: CategoriesProposalPreview["kind"]) =>
      requestJson<CategoriesProposalCreated>("/api/categories/proposal", {
        method: "POST",
        body: JSON.stringify({ previewed }),
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

/** The dot's condition: a release changed the Harness categories. */
export function useHarnessCategoriesChanged(): boolean {
  const { data } = useHarnessCategories();
  return data?.kind === "listed" && data.changed;
}

export function useCopyPreview() {
  return useQuery(categoriesQueries.copyPreview(useQueryClient()));
}

export function useHarnessCategoriesOffer() {
  return useQuery(categoriesQueries.offer(useQueryClient()));
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
      listChanged(queryClient, list);
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
