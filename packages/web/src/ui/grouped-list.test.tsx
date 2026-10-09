import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { GroupedList, type GroupedListGroup } from "./grouped-list";

const GROUPS: GroupedListGroup[] = [
  {
    tone: "neutral",
    legend: "Can be imported · 2",
    rows: [
      { key: "tdd", name: "tdd" },
      { key: "jobs", name: "jobs" },
    ],
  },
  {
    tone: "attention",
    legend: "Undoes newer Harness changes · 1",
    rows: [{ key: "grill", name: "grill", sentence: "Deployed from v0.3.1." }],
  },
  {
    tone: "failed",
    legend: "Cannot be imported · 1",
    rows: [{ key: "brief", name: "brief", sentence: "Copies differ." }],
  },
];

function checklist({
  checked = new Set(["tdd"]),
  isRunning = false,
  groups = GROUPS,
} = {}) {
  const onToggle = vi.fn();
  render(
    <GroupedList
      groups={groups}
      checklist={{ checked, onToggle, isRunning, firstBox: null }}
      live={null}
    />,
  );
  return { onToggle };
}

describe("GroupedList as a checklist", () => {
  it("names each group by its legend and each box by its row", () => {
    checklist();

    const group = screen.getByRole("group", { name: "Can be imported · 2" });
    expect(within(group).getAllByRole("checkbox")).toHaveLength(2);
    expect(within(group).getByRole("checkbox", { name: "tdd" })).toBeChecked();
    expect(
      within(group).getByRole("checkbox", { name: "jobs" }),
    ).not.toBeChecked();
  });

  it("toggles a row by its key", async () => {
    const { onToggle } = checklist();

    await userEvent.click(screen.getByRole("checkbox", { name: "jobs" }));

    expect(onToggle).toHaveBeenCalledWith("jobs");
  });

  it("keeps a refused row's box focusable and unavailable, its reason heard", async () => {
    const { onToggle } = checklist({ checked: new Set(["brief"]) });

    const box = screen.getByRole("checkbox", { name: "brief" });
    expect(box).not.toBeDisabled();
    expect(box).toHaveAttribute("aria-disabled", "true");
    expect(box).not.toBeChecked();
    expect(box).toHaveAccessibleDescription("Copies differ.");

    box.focus();
    expect(box).toHaveFocus();
    await userEvent.click(box);
    await userEvent.keyboard(" ");
    expect(box).not.toBeChecked();
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("links a costly row's sentence to its box", () => {
    checklist();

    expect(
      screen.getByRole("checkbox", { name: "grill" }),
    ).toHaveAccessibleDescription("Deployed from v0.3.1.");
  });

  it("holds every box while the action runs", () => {
    checklist({ isRunning: true });

    expect(screen.getByRole("checkbox", { name: "tdd" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "grill" })).toBeDisabled();
  });

  it("draws nothing for an empty group", () => {
    checklist({
      groups: [
        GROUPS[0] as GroupedListGroup,
        { ...(GROUPS[1] as GroupedListGroup), rows: [] },
      ],
    });

    expect(screen.getAllByRole("group")).toHaveLength(1);
  });

  it("hands the first box of the first group with rows to the focus target", () => {
    const firstBox = { current: null as HTMLInputElement | null };
    render(
      <GroupedList
        groups={[
          { ...(GROUPS[0] as GroupedListGroup), rows: [] },
          ...GROUPS.slice(1),
        ]}
        checklist={{
          checked: new Set(),
          onToggle: vi.fn(),
          isRunning: false,
          firstBox,
        }}
        live={null}
      />,
    );

    expect(firstBox.current).toBe(
      screen.getByRole("checkbox", { name: "grill" }),
    );
  });
});

describe("GroupedList read-only", () => {
  const PREFLIGHT: GroupedListGroup[] = [
    {
      tone: "attention",
      legend: "Loses work · 1",
      id: "cost",
      rows: [
        {
          key: "acme",
          name: "acme-api",
          value: "v1.0.0",
          sentence: "Nothing recorded — may lose work",
        },
      ],
    },
    {
      tone: "failed",
      legend: "Cannot be removed · 1",
      rows: [{ key: "etl", name: "legacy-etl", sentence: "Not registered" }],
    },
  ];

  it("draws each group by its legend with its rows, and nothing to press", () => {
    render(<GroupedList groups={PREFLIGHT} checklist={null} live={null} />);

    const cost = screen.getByRole("group", { name: "Loses work · 1" });
    expect(cost).toHaveTextContent("acme-api");
    expect(cost).toHaveTextContent("v1.0.0");
    expect(cost).toHaveTextContent("Nothing recorded — may lose work");
    expect(cost).toHaveAttribute("id", "cost");
    expect(
      screen.getByRole("group", { name: "Cannot be removed · 1" }),
    ).toHaveTextContent("Not registered");
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(document.querySelector("[tabindex]")).toBeNull();
  });

  it("states a group's note inside that group", () => {
    render(
      <GroupedList
        groups={[
          {
            tone: "failed",
            legend: "Cannot be removed · 1",
            note: "Register it.",
            rows: [{ key: "etl", name: "legacy-etl" }],
          },
        ]}
        checklist={null}
        live={null}
      />,
    );

    expect(
      screen.getByRole("group", { name: "Cannot be removed · 1" }),
    ).toHaveTextContent("Register it.");
  });

  it("draws a group the dialog already names without a legend", () => {
    render(
      <GroupedList
        groups={[
          {
            tone: "neutral",
            legend: null,
            rows: [{ key: "claude", name: "Claude Code", id: "row-claude" }],
          },
        ]}
        checklist={null}
        live={null}
      />,
    );

    expect(document.querySelector("legend")).toBeNull();
    expect(screen.getByRole("listitem")).toHaveAttribute("id", "row-claude");
  });

  it("marks a row whose own reading differs from its group's with that glyph", () => {
    render(
      <GroupedList
        groups={[
          {
            tone: "neutral",
            legend: null,
            rows: [
              { key: "claude", name: "Claude Code" },
              { key: "codex", name: "Codex", tone: "attention" },
            ],
          },
        ]}
        checklist={null}
        live={null}
      />,
    );

    const [clean, costly] = screen.getAllByRole("listitem");
    expect(clean).toHaveTextContent(/^Claude Code$/);
    expect(costly).toHaveTextContent("⚠");
  });

  it("is heard as its rows arrive, in a region named apart from its siblings", () => {
    const groups = (names: string[]): GroupedListGroup[] => [
      {
        tone: "neutral",
        legend: null,
        rows: names.map((name) => ({ key: name, name })),
      },
    ];
    const { rerender } = render(
      <GroupedList groups={groups([])} checklist={null} live="Other copies" />,
    );
    const region = screen.getByRole("status", { name: "Other copies" });

    rerender(
      <GroupedList
        groups={groups(["Cursor"])}
        checklist={null}
        live="Other copies"
      />,
    );

    expect(region).toHaveTextContent("Cursor");
  });

  it("mounts no live region unless asked", () => {
    render(<GroupedList groups={PREFLIGHT} checklist={null} live={null} />);

    expect(screen.queryByRole("status")).toBeNull();
  });
});
