import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Report } from "./report";

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
      "✕Failed · 1",
      "⚠Attention · 1",
      "Already up to date · 1",
      "✓Deployed · 1",
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

  it("opens with its outcome heading inside its status region", () => {
    render(<Report heading="Deployed to maestro" groups={GROUPS} />);

    expect(
      within(screen.getByRole("status")).getByRole("heading", {
        level: 3,
        name: "Deployed to maestro",
      }),
    ).toBeVisible();
  });

  it("states each row's Change word beside its name", () => {
    render(
      <Report
        heading="Proposed 2 of 2 changes"
        groups={[
          {
            tone: "good",
            label: "Proposed",
            rows: [
              { name: "code-review", change: "Added" },
              { name: "legacy-review", change: "Deleted" },
            ],
          },
        ]}
      />,
    );

    expect(
      screen.getAllByRole("listitem").map((row) => row.textContent),
    ).toEqual(["code-reviewAdded", "legacy-reviewDeleted"]);
  });

  it("links a row's pull request by its number, reachable by keyboard", () => {
    render(
      <Report
        heading="Proposed 1 of 1 change"
        groups={[
          {
            tone: "good",
            label: "Proposed",
            rows: [
              {
                name: "code-review",
                change: "Added",
                pullRequest: {
                  number: 214,
                  url: "https://github.com/fimoklei/agent-harness/pull/214",
                },
              },
            ],
          },
        ]}
      />,
    );

    const link = screen.getByRole("link", {
      name: "Pull request #214, opens in a new tab",
    });
    expect(link).toHaveAttribute(
      "href",
      "https://github.com/fimoklei/agent-harness/pull/214",
    );
    expect(link).toHaveTextContent("#214");
    expect(link).not.toHaveAttribute("tabindex");
  });

  it("closes a group with its next step, after its rows", () => {
    render(
      <Report
        heading="Imported 1 of 1 skill"
        groups={[
          {
            tone: "good",
            label: "Imported",
            note: "Select Propose change on the Harness screen.",
            rows: [{ name: "tdd" }],
          },
        ]}
      />,
    );

    const note = screen.getByText(
      "Select Propose change on the Harness screen.",
    );
    expect(
      screen.getByRole("list").compareDocumentPosition(note) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
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
      "Failed · 2",
    );
  });

  it("states a row's whole notice: heading, sentence and detail", () => {
    render(
      <Report
        heading="Deployed to maestro"
        groups={[
          {
            tone: "failed",
            label: "Failed",
            rows: [
              {
                name: "tdd",
                notice: {
                  label: "No GitHub access",
                  message:
                    "Nothing was deployed. Set up GitHub access in git, then deploy again.",
                  detail: "GitHub refused the download.",
                },
              },
            ],
          },
        ]}
      />,
    );

    const row = screen.getByRole("listitem");
    expect(within(row).getByText("No GitHub access")).toBeVisible();
    expect(
      within(row).getByText(
        "Nothing was deployed. Set up GitHub access in git, then deploy again.",
      ),
    ).toBeVisible();
    expect(within(row).getByText("GitHub refused the download.")).toBeVisible();
  });
});
