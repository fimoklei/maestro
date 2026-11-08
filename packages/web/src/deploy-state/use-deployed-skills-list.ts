import { type RefObject, useLayoutEffect, useRef, useState } from "react";
import type { SkillListRow } from "./skill-list-row";

/** Whether a list of `rows` rows, every one shown, fits its scroll area. */
export type ListFit = (list: HTMLElement | null, rows: number) => boolean;

/** The pane's own measurement: the content's height with every row shown. */
export const measureListFit: ListFit = (list, rows) => {
  const area = scrollArea(list);
  if (list === null || area === null) return true;
  const heights = [...list.children]
    .map((item) => item.getBoundingClientRect().height)
    .filter((height) => height > 0);
  const row = Math.min(...heights);
  if (!Number.isFinite(row)) return true;
  const whole =
    area.scrollHeight - list.getBoundingClientRect().height + rows * row;
  return whole <= area.clientHeight;
};

function scrollArea(element: HTMLElement | null): HTMLElement | null {
  let parent = element?.parentElement ?? null;
  while (parent !== null) {
    const { overflowY } = getComputedStyle(parent);
    if (overflowY === "auto" || overflowY === "scroll") return parent;
    parent = parent.parentElement;
  }
  return null;
}

/** What the list decided on one read, by skill name. */
type Decision = {
  reads: number;
  order: readonly string[];
  folded: readonly string[];
  /** The fold is measured once the decided order has rendered. */
  measured: boolean;
};

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
 * A target's Deployed skills, rows that need work first, worst first; when
 * the list does not fit, the rows clean in every folder fold into one group.
 * Order and fold are decided when the pane opens and after each answered
 * read, never in between, and not before the first update check answers.
 */
export function useDeployedSkillsList({
  rows,
  checked,
  reads,
  listFit,
}: {
  rows: readonly SkillListRow[];
  /** The first update check answered. */
  checked: boolean;
  /** Rises on each answered read of the target. */
  reads: number;
  listFit: ListFit;
}): {
  rows: readonly SkillListRow[];
  folded: readonly SkillListRow[];
  /** The group's open state, kept for as long as the list is mounted. */
  open: boolean;
  toggle: () => void;
  /** The list the measurement reads. */
  listRef: RefObject<HTMLUListElement | null>;
} {
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [decided, setDecided] = useState<Decision | null>(null);
  let decision = decided;
  if (checked && decision?.reads !== reads) {
    decision = {
      reads,
      order: ranked(rows),
      // The last fold holds until the new order is measured.
      folded: decided?.folded ?? [],
      measured: false,
    };
    setDecided(decision);
  }

  // Before paint, so the list never shows unfolded first.
  useLayoutEffect(() => {
    if (decided === null || decided.measured) return;
    const folds = !listFit(listRef.current, rows.length);
    setDecided({
      ...decided,
      folded: folds
        ? rows.filter((row) => row.clean).map((row) => row.primitive.name)
        : [],
      measured: true,
    });
  });

  const ordered = decision === null ? rows : inOrder(rows, decision.order);
  const isFolded = (row: SkillListRow) =>
    decision?.folded.includes(row.primitive.name) ?? false;
  return {
    rows: ordered.filter((row) => !isFolded(row)),
    folded: ordered.filter(isFolded),
    open,
    toggle: () => setOpen((was) => !was),
    listRef,
  };
}
