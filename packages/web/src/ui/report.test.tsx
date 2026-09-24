import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Report } from "./report";

// What one action did to several skills, worst group first (ADR-0033 §6), so
// the reader meets what needs them before what went well.

const GROUPS = [
  { tone: "good" as const, label: "Deployed", rows: [{ name: "grilling" }] },
  {
    tone: "neutral" as const,
    label: "Already up to date",
    rows: [{ name: "wayfinder" }],
  },
  {
    tone: "attention" as const,
    label: "Attention",
    rows: [{ name: "tdd", detail: "Local changes in deployed files" }],
  },
  {
    tone: "failed" as const,
    label: "Failed",
    rows: [
      {
        name: "research",
        detail:
          "The Maestro server did not answer. Deploy to this target again.",
      },
    ],
  },
];

describe("Report", () => {
  it("states the outcome as its heading, one level under the dialog's title", () => {
    render(<Report heading="Deployed to maestro" groups={GROUPS} />);

    expect(
      screen.getByRole("heading", { level: 3, name: /Deployed to maestro/ }),
    ).toBeVisible();
  });

  it("orders the groups worst first, whatever order it was given", () => {
    render(<Report heading="Deployed to maestro" groups={GROUPS} />);

    expect(
      screen
        .getAllByRole("heading", { level: 4 })
        .map((each) => each.textContent),
    ).toEqual([
      // The gaps are spacing, not text: happy-dom renders without CSS.
      "✕Failed1",
      "⚠Attention1",
      "Already up to date1",
      "✓Deployed1",
    ]);
  });

  it("draws no group that has nothing in it", () => {
    render(
      <Report
        heading="Deployed to maestro"
        groups={[
          { tone: "good", label: "Deployed", rows: [{ name: "grilling" }] },
          { tone: "failed", label: "Failed", rows: [] },
        ]}
      />,
    );

    expect(screen.queryByText(/Failed/)).toBeNull();
  });

  it("names every skill in a group, with its reason", () => {
    render(<Report heading="Deployed to maestro" groups={GROUPS} />);

    expect(screen.getByText("research")).toBeVisible();
    expect(
      screen.getByText(
        "The Maestro server did not answer. Deploy to this target again.",
      ),
    ).toBeVisible();
  });

  it("announces the heading once, without moving focus", () => {
    render(<Report heading="Deployed to maestro" groups={GROUPS} />);

    const live = screen.getByRole("status");
    expect(live).toHaveTextContent("Deployed to maestro");
    expect(document.activeElement).toBe(document.body);
  });

  it("offers a row's own way out where the caller gave one", async () => {
    const onClick = vi.fn();
    render(
      <Report
        heading="Deployed to maestro"
        groups={[
          {
            tone: "attention",
            label: "Attention",
            rows: [
              {
                name: "tdd",
                detail: "Local changes in deployed files",
                action: { label: "Deploy tdd again", onClick },
              },
            ],
          },
        ]}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Deploy tdd again" }),
    );

    expect(onClick).toHaveBeenCalledOnce();
  });

  it("counts the skills a group holds, where one row stands for several", () => {
    render(
      <Report
        heading="Deployed to maestro"
        groups={[
          {
            tone: "failed",
            label: "Failed",
            rows: [{ name: "tdd, review", count: 2, detail: "Deploy failed" }],
          },
        ]}
      />,
    );

    expect(screen.getByRole("heading", { level: 4 })).toHaveTextContent(
      "Failed2",
    );
  });
});
