import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { DriftViewModel } from "../drift/drift-view-model";
import { driftViewModel } from "../drift/drift-view-model";
import type { DriftResponse } from "../drift/use-drift";
import { renderWithQuery } from "../test-utils";
import { DeployStateList } from "./deploy-state-list";

const tdd = { type: "skill" as const, name: "tdd", version: "v0.5.0" };

const checked = (data: DriftResponse) =>
  driftViewModel({ data, isError: false });

const behindTdd = checked({
  behind: [
    { name: "tdd", current: "v0.5.0", latest: "v0.5.1", reading: "behind" },
  ],
});

const upToDate = checked({ behind: [] });

function renderList(drift: DriftViewModel) {
  return renderWithQuery(
    <DeployStateList
      primitives={[tdd]}
      skipped={[]}
      drift={drift}
      target={{ kind: "repo", repoPath: "/Users/me/project" }}
    />,
  );
}

describe("DeployStateList row actions", () => {
  it("gives every row an actions menu trigger, without hovering it first", () => {
    renderList(upToDate);

    expect(
      screen.getByRole("button", { name: "Actions for tdd" }),
    ).toBeInTheDocument();
  });

  it("keeps Update outside the menu on a behind row", () => {
    renderList(behindTdd);

    // Update is readable and clickable with the menu still closed: it is this
    // view's primary steering action, never a two-click detour.
    expect(
      screen.getByRole("button", { name: /update skill tdd/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("menuitem")).not.toBeInTheDocument();
  });
});
