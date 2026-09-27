// What an Update did, per skill, as a Report: worst group first, each failure
// with its cause and next step. One row per skill, per tool only where the
// tools disagree.
import type { UpdateOutcomeRow, UpdateSkillState } from "@maestro/core";
import { HttpError } from "../api/http";
import type { ReportGroup } from "../ui/report";
import {
  consentRowName,
  outcomeDetail,
  outcomeHeading,
  type UnlandedState,
} from "./update-target-copy";

const STATES = new Set([
  "updated",
  "removed",
  "not-updated",
  "missing",
  "not-removed",
  "unknown",
]);

// A report this build cannot read is dropped whole: a row built on a guess
// states an outcome the server never proved.
export function updateOutcomeRows(error: unknown): UpdateOutcomeRow[] | null {
  if (!(error instanceof HttpError)) {
    return null;
  }
  const outcome = (error.body as { outcome?: unknown } | undefined)?.outcome;
  if (!Array.isArray(outcome)) {
    return null;
  }
  const rows: UpdateOutcomeRow[] = [];
  for (const entry of outcome as UpdateOutcomeRow[]) {
    if (
      typeof entry?.name !== "string" ||
      !(entry.tool === null || typeof entry.tool === "string") ||
      !STATES.has(entry.state)
    ) {
      return null;
    }
    rows.push({ name: entry.name, tool: entry.tool, state: entry.state });
  }
  return rows;
}

export function updateOutcomeReport(input: {
  rows: readonly UpdateOutcomeRow[];
  releases: { from: string; to: string };
  /** Retry update is on screen, so a failure names it as the next step. */
  retry: boolean;
}): { heading: string; groups: ReportGroup[] } {
  const { releases, retry } = input;
  const rows = foldAgreeingTools(input.rows);
  const inState = <S extends UpdateSkillState>(...states: S[]) =>
    rows.filter((row): row is UpdateOutcomeRow & { state: S } =>
      (states as UpdateSkillState[]).includes(row.state),
    );
  const detailed = (row: UpdateOutcomeRow & { state: UnlandedState }) => ({
    name: consentRowName(row),
    detail: outcomeDetail(row.state, releases, retry),
  });

  const failed = inState("not-updated", "missing", "not-removed").map(detailed);
  const unknown = inState("unknown").map(detailed);
  return {
    heading: outcomeHeading(
      releases.to,
      failed.length > 0
        ? "failed"
        : unknown.length > 0
          ? "unconfirmed"
          : "landed",
    ),
    groups: [
      { tone: "failed", label: "Failed", rows: failed },
      { tone: "attention", label: "Attention", rows: unknown },
      {
        tone: "good",
        label: "Updated",
        rows: inState("updated").map((row) => ({
          name: consentRowName(row),
          detail: releases.to,
        })),
      },
      {
        tone: "good",
        label: "Removed",
        rows: inState("removed").map((row) => ({
          name: consentRowName(row),
        })),
      },
    ],
  };
}

function foldAgreeingTools(
  rows: readonly UpdateOutcomeRow[],
): UpdateOutcomeRow[] {
  const byName = new Map<string, UpdateOutcomeRow[]>();
  for (const row of rows) {
    byName.set(row.name, [...(byName.get(row.name) ?? []), row]);
  }
  return [...byName.values()].flatMap((group) => {
    const first = group[0];
    if (first === undefined) {
      return [];
    }
    return group.every((row) => row.state === first.state)
      ? [{ ...first, tool: null }]
      : group;
  });
}
