import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { SkillListRow } from "./skill-list-row";
import { useDeployedSkillsList } from "./use-deployed-skills-list";

// Lower rank is worse; 7 is Up to date in the skill-row order.
const row = (name: string, rank: number): SkillListRow => ({
  primitive: { type: "skill", name, version: "v0.4.1" },
  mark: null,
  value: "v0.4.1",
  hover: undefined,
  rank,
  clean: rank === 7,
});

const fits = () => true;
const doesNotFit = () => false;

type Props = Parameters<typeof useDeployedSkillsList>[0];

function renderList(initialProps: Props) {
  const hook = renderHook((props: Props) => useDeployedSkillsList(props), {
    initialProps,
  });
  const names = (rows: readonly SkillListRow[]) =>
    rows.map((each) => each.primitive.name);
  return {
    names: () => names(hook.result.current.rows),
    folded: () => names(hook.result.current.folded),
    open: () => hook.result.current.open,
    toggle: () => act(() => hook.result.current.toggle()),
    rerender: hook.rerender,
  };
}

describe("useDeployedSkillsList", () => {
  it("lists the rows that need work first, worst first, keeping their order within one mark", () => {
    const list = renderList({
      rows: [
        row("tdd", 7),
        row("ship", 2),
        row("commit", 0),
        row("jobs", 7),
        row("show-me", 2),
      ],
      checked: true,
      reads: 1,
      listFit: fits,
    });

    expect(list.names()).toEqual(["commit", "ship", "show-me", "tdd", "jobs"]);
  });

  it("keeps the rows in their order until the first update check answers", () => {
    const rows = [row("tdd", 7), row("commit", 0)];
    const list = renderList({ rows, checked: false, reads: 1, listFit: fits });

    expect(list.names()).toEqual(["tdd", "commit"]);

    list.rerender({ rows, checked: true, reads: 2, listFit: fits });
    expect(list.names()).toEqual(["commit", "tdd"]);
  });

  it("keeps the last order until a read answers, then orders again", () => {
    const list = renderList({
      rows: [row("tdd", 7), row("commit", 0)],
      checked: true,
      reads: 1,
      listFit: fits,
    });
    const flipped = [row("tdd", 0), row("commit", 7)];

    list.rerender({ rows: flipped, checked: true, reads: 1, listFit: fits });
    expect(list.names()).toEqual(["commit", "tdd"]);

    list.rerender({ rows: flipped, checked: true, reads: 2, listFit: fits });
    expect(list.names()).toEqual(["tdd", "commit"]);
  });

  it("shows every row and folds none when the list fits", () => {
    const list = renderList({
      rows: [row("tdd", 7), row("commit", 0), row("jobs", 7)],
      checked: true,
      reads: 1,
      listFit: fits,
    });

    expect(list.names()).toEqual(["commit", "tdd", "jobs"]);
    expect(list.folded()).toEqual([]);
  });

  it("folds only the rows clean in every folder when the list does not fit", () => {
    const list = renderList({
      rows: [row("tdd", 7), row("show-me", 1), row("jobs", 7), row("ship", 2)],
      checked: true,
      reads: 1,
      listFit: doesNotFit,
    });

    expect(list.names()).toEqual(["show-me", "ship"]);
    expect(list.folded()).toEqual(["tdd", "jobs"]);
  });

  it("folds nothing before the first update check answers", () => {
    const list = renderList({
      rows: [row("tdd", 7), row("commit", 0)],
      checked: false,
      reads: 1,
      listFit: doesNotFit,
    });

    expect(list.names()).toEqual(["tdd", "commit"]);
    expect(list.folded()).toEqual([]);
  });

  it("decides the fold after a read only, never in between", () => {
    const rows = [row("tdd", 7), row("commit", 0)];
    const list = renderList({ rows, checked: true, reads: 1, listFit: fits });

    // A resize changes the measurement, not the read count.
    list.rerender({ rows, checked: true, reads: 1, listFit: doesNotFit });
    expect(list.folded()).toEqual([]);

    list.rerender({ rows, checked: true, reads: 2, listFit: doesNotFit });
    expect(list.folded()).toEqual(["tdd"]);
  });

  it("keeps the folded rows until a read answers, even when a row turns clean", () => {
    const list = renderList({
      rows: [row("tdd", 7), row("commit", 0)],
      checked: true,
      reads: 1,
      listFit: doesNotFit,
    });
    const fixed = [row("tdd", 7), row("commit", 7)];

    list.rerender({
      rows: fixed,
      checked: true,
      reads: 1,
      listFit: doesNotFit,
    });
    expect(list.folded()).toEqual(["tdd"]);

    list.rerender({
      rows: fixed,
      checked: true,
      reads: 2,
      listFit: doesNotFit,
    });
    expect(list.folded()).toEqual(["tdd", "commit"]);
  });

  it("starts the group closed and keeps it open across a read once opened", () => {
    const rows = [row("tdd", 7), row("commit", 0)];
    const list = renderList({
      rows,
      checked: true,
      reads: 1,
      listFit: doesNotFit,
    });
    expect(list.open()).toBe(false);

    list.toggle();
    expect(list.open()).toBe(true);

    list.rerender({ rows, checked: true, reads: 2, listFit: doesNotFit });
    expect(list.open()).toBe(true);
  });
});
