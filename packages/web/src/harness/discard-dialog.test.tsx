import { render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { sentence } from "../test-utils";
import type { NoticeContent } from "../ui/notice";
import { DiscardDialog } from "./discard-dialog";

const renderDialog = (
  overrides: {
    defaultBranch?: string | null;
    discarding?: boolean;
    discardError?: NoticeContent | null;
  } = {},
) =>
  render(
    <DiscardDialog
      skill="research"
      folder=".apm/skills/research"
      defaultBranch={
        "defaultBranch" in overrides
          ? (overrides.defaultBranch ?? null)
          : "main"
      }
      onClose={vi.fn()}
      onConfirm={vi.fn()}
      discarding={overrides.discarding ?? false}
      discardError={overrides.discardError ?? null}
    />,
  );

describe("DiscardDialog", () => {
  it("shares its verb with the confirm button", () => {
    renderDialog();

    expect(
      screen.getByRole("dialog", { name: "Discard change for research" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Discard change" }),
    ).toBeInTheDocument();
  });

  it("opens with focus on Cancel", async () => {
    renderDialog();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus(),
    );
  });

  it("says what replaces the folder, what is lost and what stays", () => {
    renderDialog();

    expect(
      screen.getByText(
        sentence(
          "This replaces the skill folder in your clone with its copy on main. You cannot recover your changes. Deployed copies remain unchanged.",
        ),
      ),
    ).toBeInTheDocument();
  });

  it("shows the skill, the folder and the default branch it takes the copy from", () => {
    renderDialog();

    expect(screen.getByText(".apm/skills/research")).toBeInTheDocument();
    expect(
      screen.getByText("main", { selector: "dd" }),
    ).toHaveAccessibleDescription(
      "If main moves before you confirm, nothing is discarded.",
    );
  });

  it("sets the branch in its sentences apart", () => {
    renderDialog();

    for (const text of [
      "This replaces the skill folder in your clone with its copy on main. You cannot recover your changes. Deployed copies remain unchanged.",
      "If main moves before you confirm, nothing is discarded.",
    ]) {
      const line = screen.getByText(sentence(text));
      expect(
        within(line).getByText("main", { selector: ".font-mono" }),
      ).toBeInTheDocument();
    }
  });

  it("names the default branch generically where it could not be read", () => {
    renderDialog({ defaultBranch: null });

    expect(
      screen.getByText(
        "This replaces the skill folder in your clone with its copy on the default branch. You cannot recover your changes. Deployed copies remain unchanged.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Unknown")).toHaveAccessibleDescription(
      "If the default branch moves before you confirm, nothing is discarded.",
    );
  });

  it("reads as pending while the discard runs", () => {
    renderDialog({ discarding: true });

    expect(screen.getByRole("button", { name: "Discarding…" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });

  it("states a refusal inside the dialog", () => {
    renderDialog({
      discardError: {
        level: "error",
        label: "Change already proposed",
        message:
          "Nothing was discarded. Select Re-read Harness to see the skill as it is now.",
      },
    });

    expect(screen.getByText("Change already proposed")).toBeInTheDocument();
  });
});
