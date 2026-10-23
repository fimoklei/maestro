import { render, screen } from "@testing-library/react";
import { describe, it, vi } from "vitest";
import { expectVisibleCause } from "../test-utils";
import { ImportLocalEditsDialog } from "./import-local-edits-dialog";

describe("ImportLocalEditsDialog", () => {
  // The check re-reads on tab return; its failure must not hide the running import.
  it("keeps the running confirm, and ✕ described by it, when the check fails mid-run", () => {
    render(
      <ImportLocalEditsDialog
        targetName="…/me/project"
        skills={[{ name: "tdd", refusal: null }]}
        checked={new Set(["tdd"])}
        checksChanged={false}
        onToggle={vi.fn()}
        isRunning
        outcomes={null}
        failure={{
          level: "error",
          label: "Local edits not checked",
          message: "Close this dialog, then open it again.",
        }}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expectVisibleCause(
      screen.getAllByRole("button", { name: "Close" })[0] as HTMLElement,
      "Importing…",
    );
  });
});
