import { useState } from "react";
import type { SkillListRow } from "./skill-list-row";

/** The order the list decided, by skill name, and the read it decided on. */
type Decision = { reads: number; order: readonly string[] };

const ranked = (rows: readonly SkillListRow[]) =>
  [...rows].sort((a, b) => a.rank - b.rank).map((row) => row.primitive.name);

// A row the decision does not name yet keeps its place after the named ones.
function inOrder(
  rows: readonly SkillListRow[],
  order: readonly string[],
): SkillListRow[] {
  const place = (row: SkillListRow) => {
    const index = order.indexOf(row.primitive.name);
    return index === -1 ? order.length : index;
  };
  return [...rows].sort((a, b) => place(a) - place(b));
}

/**
 * A target's Deployed skills, rows that need work first, worst first. The
 * order is decided when the pane opens and after each answered read, never
 * in between, and not before the first update check answers.
 */
export function useDeployedSkillsList({
  rows,
  checked,
  reads,
}: {
  rows: readonly SkillListRow[];
  /** The first update check answered. */
  checked: boolean;
  /** Rises on each answered read of the target. */
  reads: number;
}): { rows: readonly SkillListRow[] } {
  const [decided, setDecided] = useState<Decision | null>(null);
  let decision = decided;
  if (checked && decision?.reads !== reads) {
    decision = { reads, order: ranked(rows) };
    setDecided(decision);
  }
  return { rows: decision === null ? rows : inOrder(rows, decision.order) };
}
