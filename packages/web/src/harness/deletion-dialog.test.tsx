import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { NoticeContent } from "../ui/notice";
import { DeletionDialog, type DeletionMode } from "./deletion-dialog";

const TREE = "0123456789abcdef0123456789abcdef01234567";

const PROPOSE: DeletionMode = {
  kind: "propose",
  origin: "github.com/fimoklei/agent-harness",
  seenRemoteTree: TREE,
};

const LOCAL: DeletionMode = { kind: "local", folder: ".apm/skills/research" };

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

  it("says what the tree hash is and what happens if it moves", () => {
    renderDialog();

    expect(
      screen.getByText(
        "The copy on the default branch now. If it moves before you confirm, nothing is pushed.",
      ),
    ).toBeInTheDocument();
  });

  it("carries the hint in the value's accessible description", () => {
    renderDialog();

    expect(screen.getByText(TREE)).toHaveAccessibleDescription(
      "The copy on the default branch now. If it moves before you confirm, nothing is pushed.",
    );
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
