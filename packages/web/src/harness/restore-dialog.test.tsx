import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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
      skill="research"
      folder=".apm/skills/research"
      commit={COMMIT}
      hasRequest={overrides.hasRequest ?? false}
      onClose={vi.fn()}
      onConfirm={vi.fn()}
      restoring={overrides.restoring ?? false}
      restoreError={overrides.restoreError ?? null}
    />,
  );

describe("RestoreDialog", () => {
  it("shares its verb with the confirm button", () => {
    renderDialog();

    expect(
      screen.getByRole("dialog", { name: "Restore research" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Restore skill" }),
    ).toBeInTheDocument();
  });

  it("says where the folder comes from and what it will not bring back", () => {
    renderDialog();

    expect(
      screen.getByText(
        "Restore this skill folder from your last local commit. Changes not included in that commit will not be recovered.",
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

    expect(screen.getByText(COMMIT)).toHaveAccessibleDescription(
      "Your last local commit. If it moves before you confirm, nothing is restored.",
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
          "Nothing was restored. Unstage this skill in your Git tool, then Restore skill again.",
      },
    });

    expect(screen.getByText("Skill has staged changes")).toBeInTheDocument();
  });
});
