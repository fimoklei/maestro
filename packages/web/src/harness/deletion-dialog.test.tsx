import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { NoticeContent } from "../ui/notice";
import { DeletionDialog } from "./deletion-dialog";

const TREE = "0123456789abcdef0123456789abcdef01234567";

const renderDialog = (
  overrides: { deleting?: boolean; deleteError?: NoticeContent | null } = {},
) =>
  render(
    <DeletionDialog
      skill="research"
      origin="github.com/fimoklei/agent-harness"
      seenRemoteTree={TREE}
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
});
