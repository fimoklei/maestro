import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { sentence } from "../test-utils";
import type { NoticeContent } from "../ui/notice";
import { DeletionDialog, type DeletionMode } from "./deletion-dialog";

const TREE = "0123456789abcdef0123456789abcdef01234567";

const PROPOSE: DeletionMode = {
  kind: "propose",
  origin: "fimoklei/harness",
  seenRemoteTree: TREE,
  openRequest: null,
};

const OVER_OPEN_REQUEST: DeletionMode = {
  ...PROPOSE,
  openRequest: { number: 45, author: "app/renovate" },
};

const LOCAL: DeletionMode = {
  kind: "local",
  origin: "fimoklei/harness",
  screen: "harness",
  folder: ".apm/skills/research",
  check: "ready",
  localOnly: true,
  uncommitted: true,
};

const STEP_ONE: DeletionMode = {
  ...LOCAL,
  localOnly: false,
  uncommitted: false,
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

  it("says it proposes the deletion to the origin for review", () => {
    renderDialog();

    expect(
      screen.getByText(
        sentence(
          "Delete skill proposes this deletion to fimoklei/harness for review.",
        ),
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
          sentence(
            "app/renovate opened it to propose changes to research. Delete skill replaces those changes with the deletion.",
          ),
        ),
      ).toBeInTheDocument();
    });

    it("drops the sentence about proposing the deletion", () => {
      renderDialog({ mode: OVER_OPEN_REQUEST });

      expect(
        screen.queryByText(/proposes this deletion/),
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

    it("says the folder leaves the disk and no other copy exists", () => {
      renderDialog({ mode: LOCAL });

      expect(
        screen.getByText(
          sentence(
            "Delete skill removes the folder from disk. No other copy of research exists.",
          ),
        ),
      ).toBeInTheDocument();
    });

    it("shows the folder that goes as a fact", () => {
      renderDialog({ mode: LOCAL });

      expect(screen.getByText(".apm/skills/research")).toBeInTheDocument();
    });

    // Every folder only here differs from the last commit; the warning would
    // say nothing the body does not.
    it("carries no uncommitted-changes warning", () => {
      renderDialog({ mode: LOCAL });

      expect(
        screen.queryByText("Uncommitted changes in research"),
      ).not.toBeInTheDocument();
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

  // Step 1 of deleting a skill that is on the default branch (#1370).
  describe("a skill on the default branch", () => {
    it("says it removes the folder from the clone and what keeps the skill", () => {
      renderDialog({ mode: STEP_ONE });

      expect(
        screen.getByText(
          sentence(
            "Delete skill removes the research folder from your clone of fimoklei/harness. The skill stays in fimoklei/harness and in your targets.",
          ),
        ),
      ).toBeInTheDocument();
      expect(screen.queryByText(/No other copy/)).not.toBeInTheDocument();
    });

    it("names the next step to delete it from the Harness too", () => {
      renderDialog({ mode: STEP_ONE });

      expect(
        screen.getByText(
          sentence(
            "To also delete it from fimoklei/harness, select Propose change.",
          ),
        ),
      ).toBeInTheDocument();
    });

    it("names the Harness screen when opened from another screen", () => {
      renderDialog({ mode: { ...STEP_ONE, screen: "inventory" } });

      expect(
        screen.getByText(
          sentence(
            "To also delete it from fimoklei/harness, go to the Harness screen and select Propose change.",
          ),
        ),
      ).toBeInTheDocument();
    });

    it("shows the skill and its folder as facts", () => {
      renderDialog({ mode: STEP_ONE });

      expect(screen.getByText("Skill")).toBeInTheDocument();
      expect(screen.getByText("Folder")).toBeInTheDocument();
      expect(screen.getByText(".apm/skills/research")).toBeInTheDocument();
    });

    it("opens its focus on Cancel", async () => {
      renderDialog({ mode: STEP_ONE });

      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus(),
      );
    });

    it("warns of uncommitted changes when the check found some", () => {
      renderDialog({ mode: { ...STEP_ONE, uncommitted: true } });

      expect(
        screen.getByText("Uncommitted changes in research"),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          "Delete skill discards them. To keep them, commit them in your Git tool first.",
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          sentence(
            "The skill's files in your clone of fimoklei/harness differ from its last commit.",
          ),
        ),
      ).toBeInTheDocument();
    });

    it("warns of nothing when the folder is clean", () => {
      renderDialog({ mode: STEP_ONE });

      expect(
        screen.queryByText("Uncommitted changes in research"),
      ).not.toBeInTheDocument();
    });
  });
});
