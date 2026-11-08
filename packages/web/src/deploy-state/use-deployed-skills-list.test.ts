import { renderHook } from "@testing-library/react";
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

type Props = Parameters<typeof useDeployedSkillsList>[0];

function renderList(initialProps: Props) {
  const hook = renderHook((props: Props) => useDeployedSkillsList(props), {
    initialProps,
  });
  return {
    names: () => hook.result.current.rows.map((each) => each.primitive.name),
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
    });

    expect(list.names()).toEqual(["commit", "ship", "show-me", "tdd", "jobs"]);
  });

  it("keeps the rows in their order until the first update check answers", () => {
    const rows = [row("tdd", 7), row("commit", 0)];
    const list = renderList({ rows, checked: false, reads: 1 });

    expect(list.names()).toEqual(["tdd", "commit"]);

    list.rerender({ rows, checked: true, reads: 2 });
    expect(list.names()).toEqual(["commit", "tdd"]);
  });

  it("keeps the last order until a read answers, then orders again", () => {
    const list = renderList({
      rows: [row("tdd", 7), row("commit", 0)],
      checked: true,
      reads: 1,
    });
    const flipped = [row("tdd", 0), row("commit", 7)];

    list.rerender({ rows: flipped, checked: true, reads: 1 });
    expect(list.names()).toEqual(["commit", "tdd"]);

    list.rerender({ rows: flipped, checked: true, reads: 2 });
    expect(list.names()).toEqual(["tdd", "commit"]);
  });
});
