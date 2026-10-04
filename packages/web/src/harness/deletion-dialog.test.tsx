import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { NoticeContent } from "../ui/notice";
import { DeletionDialog, type DeletionMode } from "./deletion-dialog";

const TREE = "0123456789abcdef0123456789abcdef01234567";

const PROPOSE: DeletionMode = {
  kind: "propose",
  seenRemoteTree: TREE,
  openRequest: null,
};

const OVER_OPEN_REQUEST: DeletionMode = {
  ...PROPOSE,
  openRequest: { number: 45, author: "app/renovate" },
};

const LOCAL: DeletionMode = {
  kind: "local",
  folder: ".apm/skills/research",
  check: "ready",
};

const renderDialog = (
  overrides: {
    mode?: DeletionMode;
    deleting?: boolean;
    deleteError?: NoticeContent | null;
  } = {},
) =>
  render(
    <DeletionDialog
      skill="research"
      mode={overrides.mode ?? PROPOSE}
      onClose={vi.fn()}
      onConfirm={vi.fn()}
      deleting={overrides.deleting ?? false}
      deleteError={overrides.deleteError ?? null}
    />,
  );

describe("DeletionDialog", () => {
  it("shows the whole tree hash the confirmation is given against", () => {
    renderDialog();

    expect(screen.getByText(TREE)).toBeInTheDocument();
  });

  it("names the tree hash the default branch commit and says what a push does", () => {
    renderDialog();

    expect(screen.getByText("Default branch commit")).toBeInTheDocument();
    expect(
      screen.getByText(
        "If someone pushes a commit to the default branch before you confirm, Maestro pushes nothing.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Confirmed against")).not.toBeInTheDocument();
  });

  it("carries the hint in the value's accessible description", () => {
    renderDialog();

    expect(screen.getByText(TREE)).toHaveAccessibleDescription(
      "If someone pushes a commit to the default branch before you confirm, Maestro pushes nothing.",
    );
  });

  it("says it opens a pull request to delete the skill", () => {
    renderDialog();

    expect(
      screen.getByText(
        "Delete skill opens a pull request to delete research from the Harness.",
      ),
    ).toBeInTheDocument();
  });

  // A released skill is lost to a target only at Update target, never at the merge.
  it("says the targets keep the skill until each one is updated", () => {
    renderDialog();

    expect(
      screen.getByText(
        "Your targets keep the skill. After the next release, select Update target on each target to remove it.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Nobody loses the skill until/),
    ).not.toBeInTheDocument();
  });

  it("warns of no open pull request where there is none", () => {
    renderDialog();

    expect(
      screen.queryByText(/will delete research instead/),
    ).not.toBeInTheDocument();
  });

  describe("over an open pull request that proposes changes", () => {
    it("warns that the pull request becomes the deletion and names who opened it", () => {
      renderDialog({ mode: OVER_OPEN_REQUEST });

      expect(
        screen.getByText("Pull request #45 will delete research instead"),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          "app/renovate opened it to propose changes to research. Delete skill replaces those changes with the deletion.",
        ),
      ).toBeInTheDocument();
    });

    it("drops the sentence about opening a pull request", () => {
      renderDialog({ mode: OVER_OPEN_REQUEST });

      expect(
        screen.queryByText(/opens a pull request to delete/),
      ).not.toBeInTheDocument();
      expect(
        screen.getByText(/^Your targets keep the skill\./),
      ).toBeInTheDocument();
    });
  });

  // Both modes share the title and the confirm button, which is what makes
  // them one dialog rather than two (#798).
  describe("a skill that exists nowhere else", () => {
    it("keeps the same title and confirm button", () => {
      renderDialog({ mode: LOCAL });

      expect(
        screen.getByRole("dialog", { name: "Delete research" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Delete skill" }),
      ).toBeInTheDocument();
    });

    it("says the skill exists nowhere else and the removal is final", () => {
      renderDialog({ mode: LOCAL });

      expect(
        screen.getByText(
          /is in the Harness working tree and nowhere else\. Confirming removes the folder from disk for good\./,
        ),
      ).toBeInTheDocument();
    });

    it("shows the folder that goes as a fact", () => {
      renderDialog({ mode: LOCAL });

      expect(screen.getByText(".apm/skills/research")).toBeInTheDocument();
    });

    // The propose mode's reassurance is true only because a merge stands
    // between the author and the loss. Here nothing does.
    it("carries no reassuring second sentence", () => {
      renderDialog({ mode: LOCAL });

      expect(
        screen.queryByText(/Nobody loses the skill until/),
      ).not.toBeInTheDocument();
      expect(screen.queryByText(TREE)).not.toBeInTheDocument();
    });
  });
});
