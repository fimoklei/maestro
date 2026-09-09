import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StageTable } from "./stage-table";
import type { HarnessStageRow } from "./use-harness";

const row = (skill: string): HarnessStageRow => ({
  stage: "pending-proposal",
  skill,
  status: "not-yet-proposed",
  deletion: false,
  requests: [],
  reviewers: [],
  comparison: { kind: "default-branch" },
  alsoIn: [],
  concurrentChange: false,
  remoteTree: null,
  previousName: null,
});

const renderTable = () =>
  render(
    <StageTable
      title="Pending proposal"
      rows={[row("tdd")]}
      context={{ defaultBranch: "main", releasedVersion: "v1.4.0" }}
      actions={{ items: () => [], failed: null }}
    />,
  );

describe("StageTable", () => {
  // The table keeps a 760px floor and scrolls sideways inside its card. A
  // scroll container that cannot take focus is keyboard-unreachable
  // (WCAG 2.1.1), which is what inventory-list.tsx already answers for.
  it("names its scroll container after the stage it holds", () => {
    renderTable();

    expect(
      screen.getByRole("region", { name: "Pending proposal table" }),
    ).toBeInTheDocument();
  });

  it("lets the keyboard reach the rows the card clips", () => {
    renderTable();

    expect(
      screen.getByRole("region", { name: "Pending proposal table" }),
    ).toHaveAttribute("tabindex", "0");
  });
});
