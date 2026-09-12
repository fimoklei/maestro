// What the reader sees after an Update: one line per skill, and one per tool
// only where the tools disagree — a failing copy names where to look, a set of
// copies that all landed states the skill once (spec stories 28, 33).
import type { UpdateOutcomeRow } from "@maestro/core";
import { HttpError } from "../api/http";
import { outcomeLine } from "./update-target-copy";

const STATES = new Set([
  "updated",
  "removed",
  "not-updated",
  "not-removed",
  "unknown",
]);

// The ledger a refused update sends with its code. A report this build cannot
// read is dropped whole rather than half-drawn: a line built on a guess states
// an outcome the server never proved (J04).
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

export type OutcomeLine = { key: string; ok: boolean; text: string };

const LANDED = new Set(["updated", "removed"]);

export function updateOutcomeLines(
  rows: readonly UpdateOutcomeRow[],
  releases: { from: string; to: string },
): OutcomeLine[] {
  const byName = new Map<string, UpdateOutcomeRow[]>();
  for (const row of rows) {
    byName.set(row.name, [...(byName.get(row.name) ?? []), row]);
  }
  return [...byName.values()].flatMap((group) => {
    const first = group[0];
    if (first === undefined) {
      return [];
    }
    const agree = group.every((row) => row.state === first.state);
    return (agree ? [{ ...first, tool: null }] : group).map((row) => ({
      key: `${row.name}:${row.tool ?? ""}`,
      ok: LANDED.has(row.state),
      text: outcomeLine(row, releases),
    }));
  });
}
