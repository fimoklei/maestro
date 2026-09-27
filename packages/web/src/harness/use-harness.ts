// Two reads: a plain one that paints the local picture at once, and a refresh
// that reaches the remote and replaces it.

import type {
  HarnessFreshness,
  HarnessStage,
  HarnessStageRead,
  HarnessStageRow,
  HarnessState,
  ImportCheck,
  ImportMode,
  ImportNameBlocker,
  ImportSourceBlocker,
  ManifestAdvisory,
  PendingSkillMovement,
  ReleasePlan,
  RequestedReviewer,
  ReviewRequestLink,
  SemverStep,
  SkillMovementKind,
  StageStatus,
  StructuralProblem,
} from "@maestro/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { HttpError, requestJson } from "../api/http";
import {
  fetchInventoryPrimitives,
  INVENTORY_KEY,
} from "../inventory/use-inventory";

export type {
  HarnessFreshness,
  HarnessStage,
  HarnessStageRead,
  HarnessStageRow,
  HarnessState,
  ImportCheck,
  ImportNameBlocker,
  ImportSourceBlocker,
  ManifestAdvisory,
  PendingSkillMovement,
  ReleasePlan,
  RequestedReviewer,
  ReviewRequestLink,
  SemverStep,
  SkillMovementKind,
  StageStatus,
  StructuralProblem,
};

// Every Harness read shares this prefix, so a re-point drops them together.
export const HARNESS_QUERIES = ["harness"] as const;
const HARNESS_KEY = ["harness", "state"] as const;
const RELEASE_PLAN_KEY = ["harness", "release-plan"] as const;

// Gated for callers without a connected Harness yet — the endpoint 409s until
// one is set, and the sidebar reads it on every screen.
export function useHarness({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: HARNESS_KEY,
    queryFn: () => requestJson<HarnessState>("/api/harness"),
    enabled,
  });
}

// Fetched only while the dialog is open: a stale plan would price a release the
// remote has already moved past.
export function useReleasePlan(enabled: boolean) {
  return useQuery({
    queryKey: RELEASE_PLAN_KEY,
    queryFn: () => requestJson<ReleasePlan>("/api/harness/release-plan"),
    enabled,
    staleTime: 0,
    gcTime: 0,
  });
}

// Closing the dialog must discard the plan, not park it. `gcTime: 0` collects
// nothing while the hook stays mounted, so reopening would render the previous
// revision and version until the new request lands (#519).
export function useDiscardReleasePlan() {
  const queryClient = useQueryClient();
  return () => queryClient.removeQueries({ queryKey: RELEASE_PLAN_KEY });
}

// `previousTag` and `revision` are what the server compares the fresh remote
// against, never the thing to tag (#520, #521).
export function usePublishRelease() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (request: {
      step: SemverStep;
      previousTag: string | null;
      previousTagCommit: string | null;
      revision: string;
    }) => {
      const release = await requestJson<{ tag: string; revision: string }>(
        "/api/harness/release",
        { method: "POST", body: JSON.stringify(request) },
      );
      // Fetched, not invalidated: a query nobody holds open would refetch
      // nothing (#849).
      const inventoryRefreshed = await queryClient
        .fetchQuery({
          queryKey: INVENTORY_KEY,
          queryFn: fetchInventoryPrimitives,
          staleTime: 0,
        })
        .then(
          () => true,
          () => false,
        );
      return { tag: release.tag, inventoryRefreshed };
    },
    onSuccess: () => {
      void queryClient.cancelQueries({ queryKey: HARNESS_KEY });
      void fetchHarnessState().then(
        (state) => queryClient.setQueryData(HARNESS_KEY, state),
        () => queryClient.invalidateQueries({ queryKey: HARNESS_KEY }),
      );
    },
    // A refused plan comes back with the one that replaces it. Without a
    // replacement the old plan is asked for again, never left standing (#521).
    onError: (error) => {
      const plan = recomputedPlan(error);
      if (plan === null) {
        void queryClient.invalidateQueries({ queryKey: RELEASE_PLAN_KEY });
        return;
      }
      queryClient.setQueryData(RELEASE_PLAN_KEY, plan);
    },
  });
}

// A reply the dialog would crash on or render half-blank reads as absent, so
// the author is asked for a fresh plan instead.
function recomputedPlan(error: unknown): ReleasePlan | null {
  if (!(error instanceof HttpError)) {
    return null;
  }
  const plan = (error.body as { plan?: unknown } | undefined)?.plan;
  if (plan === null || typeof plan !== "object") {
    return null;
  }
  const shape = plan as Partial<ReleasePlan>;
  const versions = shape.versions;
  const complete =
    typeof shape.revision === "string" &&
    typeof shape.defaultBranch === "string" &&
    typeof shape.reason === "string" &&
    isOneOf(shape.proposedStep, STEPS) &&
    isNullableString(shape.previousTag) &&
    isNullableString(shape.previousTagCommit) &&
    versions !== undefined &&
    versions !== null &&
    STEPS.every((step) => typeof versions[step] === "string") &&
    isArrayOf(shape.delta, isMovement) &&
    isArrayOf(shape.findings, isFinding);
  return complete ? (plan as ReleasePlan) : null;
}

const STEPS = ["major", "minor", "patch"] as const;
const MOVEMENT_KINDS = ["added", "changed", "removed", "renamed"] as const;
const PROBLEMS = [
  "missing-manifest",
  "invalid-frontmatter",
  "empty-description",
] as const;

const isOneOf = <T extends string>(
  value: unknown,
  allowed: readonly T[],
): boolean => allowed.includes(value as T);

const isNullableString = (value: unknown): boolean =>
  value === null || typeof value === "string";

const isArrayOf = (
  value: unknown,
  element: (entry: Record<string, unknown>) => boolean,
): boolean =>
  Array.isArray(value) &&
  value.every(
    (entry) =>
      entry !== null &&
      typeof entry === "object" &&
      element(entry as Record<string, unknown>),
  );

const isMovement = (entry: Record<string, unknown>): boolean =>
  isOneOf(entry.kind, MOVEMENT_KINDS) &&
  typeof entry.name === "string" &&
  isNullableString(entry.author);

const isFinding = (entry: Record<string, unknown>): boolean =>
  typeof entry.skill === "string" && isOneOf(entry.problem, PROBLEMS);

const fetchHarnessState = () =>
  requestJson<HarnessState>("/api/harness/refresh", { method: "POST" });

// Re-asked whenever the folder or name changes: the server owns every refusal.
export function useImportCheck(source: string | null, name: string | null) {
  return useQuery({
    queryKey: ["harness", "import-check", source, name] as const,
    queryFn: () =>
      requestJson<ImportCheck>("/api/harness/import/check", {
        method: "POST",
        body: JSON.stringify(name === null ? { source } : { source, name }),
      }),
    enabled: source !== null,
    // A check is a snapshot of the disk at one moment, and the disk is the
    // author's to change while the dialog is open.
    staleTime: 0,
    gcTime: 0,
  });
}

// `skipped` counts the `.git` entries the copy did not carry.
export type ImportOutcome = {
  mode: ImportMode;
  name: string;
  skipped: number;
};

// Invalidated rather than written: only the read can say what landed (#576).
export function useImportSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: { source: string; name: string }) =>
      requestJson<ImportOutcome>("/api/harness/import", {
        method: "POST",
        body: JSON.stringify(request),
      }),
    // Returned, so the dialog closes onto a read that already holds the row.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: HARNESS_KEY }),
  });
}

export type PromoteOutcome = { branch: string; pullRequestUrl: string };

// A name travels, never a path; the row's new stage is read from git (#577).
export function usePromoteSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: { name: string }) =>
      requestJson<PromoteOutcome>("/api/harness/promote", {
        method: "POST",
        body: JSON.stringify(request),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: HARNESS_KEY });
    },
  });
}

// The number the row showed is a claim: the server rechecks it against a fresh
// read before closing or reopening anything (#827).
export type ProposalAction = "create" | "reopen" | "withdraw";

export function useProposalAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      action,
      ...body
    }: {
      action: ProposalAction;
      name: string;
      number?: number;
    }) =>
      requestJson<{ ok: true }>(`/api/harness/proposal/${action}`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: HARNESS_KEY });
    },
  });
}

// Carries the origin/HEAD tree the row was read against, so the server can
// refuse a removal the remote has moved past (#580).
export function usePromoteDeletion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: { name: string; seenRemoteTree: string }) =>
      requestJson<PromoteOutcome>("/api/harness/promote/deletion", {
        method: "POST",
        body: JSON.stringify(request),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: HARNESS_KEY });
    },
  });
}

// Only the name travels: nothing here reaches a remote (#798).
export function useDeleteLocalSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: { name: string }) =>
      requestJson<{ name: string }>("/api/harness/skill/delete", {
        method: "POST",
        body: JSON.stringify(request),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: HARNESS_KEY });
    },
  });
}

// `hasRequest` never leaves the browser; it only picks the notice's sentence
// (#915).
export function useRestoreSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (request: {
      name: string;
      seenHeadCommit: string;
      hasRequest: boolean;
    }) => {
      const restored = await requestJson<{ name: string; commit: string }>(
        "/api/harness/skill/restore",
        {
          method: "POST",
          body: JSON.stringify({
            name: request.name,
            seenHeadCommit: request.seenHeadCommit,
          }),
        },
      );
      // The folder is on disk from here on, whatever the re-read answers.
      void queryClient.cancelQueries({ queryKey: HARNESS_KEY });
      const state = await fetchHarnessState().then(
        (fresh) => {
          queryClient.setQueryData(HARNESS_KEY, fresh);
          return fresh;
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: HARNESS_KEY });
          return null;
        },
      );
      return {
        name: restored.name,
        hasRequest: request.hasRequest,
        // A local success is never presented as a verified remote one: the
        // review stage is what GitHub answered, and it stands for the status.
        statusRead: state !== null && state.stages.review.outcome === "read",
      };
    },
  });
}

// A refresh carries the answer, so it is written straight into the cache.
export function useRefreshHarness() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fetchHarnessState,
    onSuccess: (state) => {
      // Cancel the plain read first, or a slower GET repaints the older
      // picture. Not awaited: waiting on the aborted request would hold the
      // mutation open across a remount.
      void queryClient.cancelQueries({ queryKey: HARNESS_KEY });
      queryClient.setQueryData(HARNESS_KEY, state);
    },
  });
}
