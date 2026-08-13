import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { MovementTable } from "./movement-table";

describe("MovementTable", () => {
  it("labels a locally deleted skill as deleted locally", () => {
    render(
      <MovementTable
        movements={[
          {
            skill: "tdd",
            state: "pending-promotion",
            deletion: true,
            concurrentChange: false,
          },
        ]}
      />,
    );

    expect(screen.getByText("tdd")).toBeInTheDocument();
    expect(screen.getByText("deleted locally")).toBeInTheDocument();
  });

  it("lets a long skill name shrink so the deletion chip stays in the cell", () => {
    const longName = "a-very-long-unbroken-skill-name-that-would-overflow";
    render(
      <MovementTable
        movements={[
          {
            skill: longName,
            state: "pending-promotion",
            deletion: true,
            concurrentChange: false,
          },
        ]}
      />,
    );

    expect(screen.getByText(longName)).toHaveClass("min-w-0", "truncate");
    expect(screen.getByText("deleted locally")).toBeInTheDocument();
  });

  it("leaves a movement that is not a deletion unlabelled", () => {
    render(
      <MovementTable
        movements={[
          {
            skill: "lint-rules",
            state: "pending-promotion",
            deletion: false,
            concurrentChange: false,
          },
        ]}
      />,
    );

    expect(screen.getByText("lint-rules")).toBeInTheDocument();
    expect(screen.queryByText("deleted locally")).not.toBeInTheDocument();
  });

  const promote = {
    onPromote: () => {},
    enabled: true,
    pending: null,
    pullRequests: {},
    justPromoted: null,
    failed: null,
  };

  const rowOf = (skill: string) =>
    screen.getByText(skill).closest("tr") as HTMLElement;

  it("presses only for the skill on that row", async () => {
    const pressed: string[] = [];
    render(
      <MovementTable
        movements={[
          {
            skill: "lint-rules",
            state: "pending-promotion",
            deletion: false,
            concurrentChange: false,
          },
          {
            skill: "code-review",
            state: "pending-promotion",
            deletion: false,
            concurrentChange: false,
          },
        ]}
        promote={{ ...promote, onPromote: (skill) => pressed.push(skill) }}
      />,
    );

    await userEvent.click(
      within(rowOf("code-review")).getByRole("button", { name: "promote" }),
    );

    expect(pressed).toEqual(["code-review"]);
  });

  it("offers no press on an already pushed row, nor on a deletion", () => {
    render(
      <MovementTable
        movements={[
          {
            skill: "lint-rules",
            state: "pending-review",
            deletion: false,
            concurrentChange: false,
          },
          {
            skill: "old-skill",
            state: "pending-promotion",
            deletion: true,
            concurrentChange: false,
          },
        ]}
        promote={promote}
      />,
    );

    expect(screen.queryByRole("button", { name: "promote" })).toBeNull();
    // No press anywhere means no column claiming one.
    expect(screen.queryByText("Action")).toBeNull();
  });

  it("holds every press while one promotion is in flight", () => {
    render(
      <MovementTable
        movements={[
          {
            skill: "lint-rules",
            state: "pending-promotion",
            deletion: false,
            concurrentChange: false,
          },
          {
            skill: "code-review",
            state: "pending-promotion",
            deletion: false,
            concurrentChange: false,
          },
        ]}
        promote={{ ...promote, pending: "lint-rules" }}
      />,
    );

    expect(
      within(rowOf("lint-rules")).getByRole("button", { name: /promoting/ }),
    ).toBeDisabled();
    expect(
      within(rowOf("code-review")).getByRole("button", { name: "promote" }),
    ).toBeDisabled();
  });

  it("closes the press while the remote's answer is unknown", () => {
    render(
      <MovementTable
        movements={[
          {
            skill: "lint-rules",
            state: "pending-promotion",
            deletion: false,
            concurrentChange: false,
          },
        ]}
        promote={{ ...promote, enabled: false }}
      />,
    );

    expect(screen.getByRole("button", { name: "promote" })).toBeDisabled();
  });

  it("keeps every promoted skill's link, not only the last one", () => {
    render(
      <MovementTable
        movements={[
          {
            skill: "lint-rules",
            state: "pending-review",
            deletion: false,
            concurrentChange: false,
          },
          {
            skill: "code-review",
            state: "pending-review",
            deletion: false,
            concurrentChange: false,
          },
        ]}
        promote={{
          ...promote,
          pullRequests: {
            "lint-rules": "https://github.com/o/r/compare/a...b",
            "code-review": "https://github.com/o/r/compare/a...c",
          },
          justPromoted: "code-review",
        }}
      />,
    );

    expect(
      within(rowOf("lint-rules")).getByRole("link", { name: /pull request/ }),
    ).toHaveAttribute("href", "https://github.com/o/r/compare/a...b");
    // Only the row whose press just landed takes the focus its button had.
    expect(
      within(rowOf("code-review")).getByRole("link", { name: /pull request/ }),
    ).toHaveFocus();
  });

  it("offers the press again when a promoted skill is promotable once more", () => {
    // The branch behind that link was merged and a later edit put the skill
    // back in Pending promotion. The freshly read row decides, not the link
    // this visit happens to remember (#577).
    render(
      <MovementTable
        movements={[
          {
            skill: "lint-rules",
            state: "pending-promotion",
            deletion: false,
            concurrentChange: false,
          },
        ]}
        promote={{
          ...promote,
          pullRequests: {
            "lint-rules": "https://github.com/o/r/compare/a...b",
          },
          justPromoted: "lint-rules",
        }}
      />,
    );

    expect(screen.getByRole("button", { name: "promote" })).toBeEnabled();
    expect(screen.queryByRole("link", { name: /pull request/ })).toBeNull();
  });

  it("states a refusal on the row it belongs to", () => {
    render(
      <MovementTable
        movements={[
          {
            skill: "lint-rules",
            state: "pending-promotion",
            deletion: false,
            concurrentChange: false,
          },
        ]}
        promote={{
          ...promote,
          failed: { skill: "lint-rules", message: "The remote refused it." },
        }}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "The remote refused it.",
    );
    expect(screen.getByRole("button", { name: "promote" })).toBeEnabled();
  });

  it("warns that promoting replaces a teammate's change, and keeps the press available", () => {
    render(
      <MovementTable
        movements={[
          {
            skill: "lint-rules",
            state: "pending-promotion",
            deletion: false,
            concurrentChange: true,
          },
        ]}
        promote={promote}
      />,
    );

    expect(screen.getByText(/replaces/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "promote" })).toBeEnabled();
  });

  it("shows no concurrent-change warning when nobody else touched the skill", () => {
    render(
      <MovementTable
        movements={[
          {
            skill: "lint-rules",
            state: "pending-promotion",
            deletion: false,
            concurrentChange: false,
          },
        ]}
        promote={promote}
      />,
    );

    expect(screen.queryByText(/replaces/i)).not.toBeInTheDocument();
  });

  it("never warns on a deletion, which has no press this table offers", () => {
    render(
      <MovementTable
        movements={[
          {
            skill: "old-skill",
            state: "pending-promotion",
            deletion: true,
            concurrentChange: true,
          },
        ]}
        promote={promote}
      />,
    );

    expect(screen.queryByText(/replaces/i)).not.toBeInTheDocument();
  });
});
