import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { DriftViewModel } from "../drift/drift-view-model";
import { driftViewModel } from "../drift/drift-view-model";
import type { DriftResponse } from "../drift/use-drift";
import { renderWithQuery } from "../test-utils";
import { SelectedSkills } from "./selected-skills";
import type { DeployedPrimitive } from "./use-deploy-state";

// Successor of the retired DeployStateList's test. The removal flow behind a
// row's menu is covered by the remove-skill-row-*.test.tsx files.

const tdd: DeployedPrimitive = {
  type: "skill",
  name: "tdd",
  version: "v0.5.0",
};

const checked = (data: DriftResponse) =>
  driftViewModel({ data, isError: false });

const behindTdd = checked({
  behind: [
    { name: "tdd", current: "v0.5.0", latest: "v0.5.1", reading: "behind" },
  ],
});

const upToDate = checked({ behind: [] });

function renderList(
  drift: DriftViewModel,
  primitives: DeployedPrimitive[] = [tdd],
) {
  return renderWithQuery(
    <SelectedSkills
      primitives={primitives}
      drift={drift}
      target={{ kind: "repo", repoPath: "/Users/me/project" }}
    />,
  );
}

describe("SelectedSkills row actions", () => {
  it("gives every row an actions menu trigger, without hovering it first", () => {
    renderList(upToDate);

    expect(
      screen.getByRole("button", { name: "Actions for tdd" }),
    ).toBeInTheDocument();
  });

  // A target follows one release, so a row carries no update of its own: the
  // whole target moves through Update target (spec story 12, #954).
  it("offers no per-row update on a behind row", () => {
    renderList(behindTdd);

    expect(screen.queryByRole("button", { name: /update/i })).toBeNull();
    expect(screen.queryByRole("menuitem")).not.toBeInTheDocument();
  });
});

describe("SelectedSkills marks", () => {
  it("counts the selected skills and names each with its version", () => {
    renderList(upToDate, [tdd, { ...tdd, name: "grill", version: "v0.4.0" }]);

    expect(
      screen.getByRole("heading", { level: 3, name: "Selected skills 2" }),
    ).toBeInTheDocument();
    expect(screen.getByText("grill")).toBeInTheDocument();
    expect(screen.getByText("v0.4.0")).toBeInTheDocument();
  });

  it("carries one mark per row, named by its word, never two", () => {
    renderList(behindTdd, [{ ...tdd, copy: "local-edits" }]);

    expect(
      screen.getByRole("img", { name: "Local edits" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("img")).toHaveLength(1);
  });

  it("shows a mark's word and reason in a tooltip on focus, and closes it on Escape", async () => {
    const user = userEvent.setup();
    renderList(behindTdd, [{ ...tdd, copy: "local-edits" }]);
    const mark = screen.getByRole("img", { name: "Local edits" });

    await user.tab();
    expect(mark).toHaveFocus();
    const tooltip = await screen.findByRole("tooltip", { hidden: true });
    expect(tooltip).toHaveTextContent(
      "This copy differs from the release it was deployed from",
    );
    expect(document.body).toHaveTextContent(
      /Local edits\s*This copy differs from the release it was deployed from/,
    );
    // The word is the name; the reason is said once, as the description.
    expect(mark).toHaveAccessibleName("Local edits");
    expect(mark).toHaveAccessibleDescription(
      "This copy differs from the release it was deployed from",
    );
    expect(mark).not.toHaveAttribute("title");

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip", { hidden: true })).toBeNull();
  });

  it("shows a mark with no reason as its word alone, on hover", async () => {
    const user = userEvent.setup();
    renderList(behindTdd);

    await user.hover(screen.getByRole("img", { name: "Behind" }));
    expect(
      await screen.findByRole("tooltip", { hidden: true }),
    ).toHaveTextContent(/^Behind$/);
  });

  it("marks a behind skill and states its deployed → latest pair", () => {
    renderList(behindTdd);

    expect(screen.getByRole("img", { name: "Behind" })).toBeInTheDocument();
    expect(screen.getByText(/v0\.5\.0\s*→\s*v0\.5\.1/)).toBeInTheDocument();
  });

  it("marks nothing while the check is still running", () => {
    renderList(driftViewModel({ data: undefined, isError: false }));

    expect(screen.getByText("tdd")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("surfaces a behind name that is not a deployed skill, instead of dropping it", () => {
    renderList(
      checked({
        behind: [
          {
            name: "foo",
            current: "v1.0.0",
            latest: "v1.1.0",
            reading: "behind",
          },
        ],
      }),
    );

    expect(screen.getByText(/not deployed here/i)).toHaveTextContent(/foo/);
  });
});
