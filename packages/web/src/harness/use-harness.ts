// Server-state for the Harness home base (frontend.md — no fetch-in-effect).
// Two operations: a plain read that paints the local picture at once, and a
// refresh that reaches the remote and replaces it.

import type {
  HarnessFreshness,
  HarnessMovement,
  HarnessReleaseState,
  HarnessState,
  ImportCheck,
  ImportNameBlocker,
  ImportSourceBlocker,
  ManifestAdvisory,
  PendingSkillMovement,
  ReleasePlan,
  SemverStep,
  SkillMovementKind,
  StructuralProblem,
} from "@maestro/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { HttpError, requestJson } from "../api/http";

// Re-exported rather than copied, so the browser's shape cannot drift from the
// one core defines (architecture.md).
export type {
  HarnessFreshness,
  HarnessMovement,
  HarnessReleaseState,
  HarnessState,
  ImportCheck,
  ImportNameBlocker,
  ImportSourceBlocker,
  ManifestAdvisory,
  PendingSkillMovement,
  ReleasePlan,
  SemverStep,
  SkillMovementKind,
  StructuralProblem,
};

const HARNESS_KEY = ["harness", "state"] as const;
const RELEASE_PLAN_KEY = ["harness", "release-plan"] as const;

export function useHarness() {
  return useQuery({
    queryKey: HARNESS_KEY,
    queryFn: () => requestJson<HarnessState>("/api/harness"),
  });
}

// The release plan for the dialog, fetched only while it is open. A plan is a
// snapshot of one moment's delta, and a stale one would price a release the
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

// Confirming a release. `previousTag` and `revision` are what the server
// compares the freshly read remote against; neither is ever the thing to tag,
// and no path travels (#520, #521).
//
// The picture afterwards is fetched, never read: the plain read paints from a
// local tag mirror whose write can fail, and the release already happened.
export function usePublishRelease() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: {
      step: SemverStep;
      previousTag: string | null;
      previousTagCommit: string | null;
      revision: string;
    }) =>
      requestJson<{ tag: string; revision: string }>("/api/harness/release", {
        method: "POST",
        body: JSON.stringify(request),
      }),
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

// Every field the dialog reads, down to each list element: a reply the dialog
// would crash on or render half-blank must read as absent, so the author is
// asked for a fresh plan instead (security.md).
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

// What Import would do with the picked folder and the chosen name, re-asked
// whenever either changes — the server owns every refusal, so the button never
// decides one itself. Disabled until a folder is picked.
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

// What an import landed, and what it left behind: `skipped` counts the `.git`
// entries the copy did not carry.
export type ImportOutcome = { name: string; skipped: number };

// Importing itself. The harness read is invalidated rather than written: what
// landed shows up as a pending promotion, which only the read can say (#576).
export function useImportSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: { source: string; name: string }) =>
      requestJson<ImportOutcome>("/api/harness/import", {
        method: "POST",
        body: JSON.stringify(request),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: HARNESS_KEY });
    },
  });
}

// Writes the fetched state straight into the query cache: a refresh already
// carries the answer, so re-reading it would only show an older picture first.
export function useRefreshHarness() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fetchHarnessState,
    onSuccess: (state) => {
      // The plain read races this one on open. Cancelling it first stops a
      // slower GET from repainting the pre-fetch picture over this answer.
      // Not awaited: the cancel takes effect at once, and waiting for the
      // aborted request would hold the mutation open across a remount.
      void queryClient.cancelQueries({ queryKey: HARNESS_KEY });
      queryClient.setQueryData(HARNESS_KEY, state);
    },
  });
}
