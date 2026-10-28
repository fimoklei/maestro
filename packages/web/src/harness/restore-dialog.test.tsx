import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { expectDescription } from "../test-utils";
import type { NoticeContent } from "../ui/notice";
import { RestoreDialog } from "./restore-dialog";

const COMMIT = "0123456789abcdef0123456789abcdef01234567";

const renderDialog = (
  overrides: {
    hasRequest?: boolean;
    restoring?: boolean;
    restoreError?: NoticeContent | null;
  } = {},
) =>
  render(
    <RestoreDialog
      type="skill"
      name="research"
      path=".apm/skills/research"
      commit={COMMIT}
      hasRequest={overrides.hasRequest ?? false}
      onClose={vi.fn()}
      onConfirm={vi.fn()}
      restoring={overrides.restoring ?? false}
      restoreError={overrides.restoreError ?? null}
    />,
  );

describe("RestoreDialog", () => {
  it("sets the skill name in the UI font, not mono", () => {
    renderDialog();

    const name = screen.getByText("research", { selector: "dd" });
    expect(name).toHaveClass("font-ui");
    expect(name).not.toHaveClass("font-mono");
  });

  it("shares its verb with the confirm button", () => {
    renderDialog();

    expect(
      screen.getByRole("dialog", { name: "Restore research" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Restore skill" }),
    ).toBeInTheDocument();
  });

  it("opens with focus on Cancel", async () => {
    renderDialog();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus(),
    );
  });

  it("says where the folder comes from and what it will not bring back", () => {
    renderDialog();

    expect(
      screen.getByText(
        "Restore skill brings back the folder from your last local commit. Later changes do not come back.",
      ),
    ).toBeInTheDocument();
  });

  it("shows the skill, the folder and the whole commit it restores from", () => {
    renderDialog();

    expect(screen.getByText(".apm/skills/research")).toBeInTheDocument();
    expect(screen.getByText(COMMIT)).toBeInTheDocument();
  });

  it("says what the commit is and what happens if it moves", () => {
    renderDialog();

    expectDescription(
      screen.getByText(COMMIT),
      "If your clone's last commit moves before you confirm, nothing is restored.",
    );
  });

  // A restore writes the working tree and nothing else, so an open proposal is
  // untouched — said here, before the press, not only after it (#915).
  it("says the open proposal stays as it is, and only where there is one", () => {
    renderDialog({ hasRequest: true });

    expect(
      screen.getByText("Your proposal remains unchanged."),
    ).toBeInTheDocument();
  });

  it("carries no proposal sentence on a row with no request", () => {
    renderDialog();

    expect(screen.queryByText(/Your proposal remains unchanged/)).toBeNull();
  });

  it("reads as pending while the restore runs", () => {
    renderDialog({ restoring: true });

    expect(screen.getByRole("button", { name: "Restoring…" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });

  it("states a refusal inside the dialog", () => {
    renderDialog({
      restoreError: {
        level: "error",
        label: "Skill has staged changes",
        message:
          "Nothing was restored. Unstage this skill in your Git tool, then select Restore skill again.",
      },
    });

    expect(screen.getByText("Skill has staged changes")).toBeInTheDocument();
  });

  describe("a prompt", () => {
    const renderPrompt = () =>
      render(
        <RestoreDialog
          type="prompt"
          name="pr-review"
          path=".maestro/prompts/pr-review.md"
          commit={COMMIT}
          hasRequest={false}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
          restoring={false}
          restoreError={null}
        />,
      );

    it("titles the dialog with the prompt and confirms with Restore prompt", () => {
      renderPrompt();

      expect(
        screen.getByRole("dialog", { name: "Restore pr-review" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Restore prompt" }),
      ).toBeInTheDocument();
    });

    it("says it brings back the file from the last local commit", () => {
      renderPrompt();

      expect(
        screen.getByText(
          "Restore prompt brings back the file from your last local commit. Later changes do not come back.",
        ),
      ).toBeInTheDocument();
    });

    it("shows the prompt and its file as facts", () => {
      renderPrompt();

      expect(screen.getByText("Prompt")).toBeInTheDocument();
      expect(screen.getByText("File")).toBeInTheDocument();
      expect(
        screen.getByText(".maestro/prompts/pr-review.md"),
      ).toBeInTheDocument();
    });
  });
});
