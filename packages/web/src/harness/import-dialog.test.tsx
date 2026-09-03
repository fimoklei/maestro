import { render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { ImportDialog } from "./import-dialog";

// Deep enough that the head of the path says nothing the reader needs.
const DEEP = "/Users/me/Projects/harness-sandbox/incoming-skills/release-notes";

const CHECK = {
  mode: "add" as const,
  name: "release-notes",
  sourceBlocker: null,
  nameBlocker: null,
  advisories: [],
};

function renderDialog(
  source: string | null,
  load: ComponentProps<typeof ImportDialog>["load"] = { kind: "idle" },
  imported: ComponentProps<typeof ImportDialog>["imported"] = null,
) {
  render(
    <ImportDialog
      source={source}
      name="release-notes"
      load={load}
      onPickSource={vi.fn()}
      onNameChange={vi.fn()}
      onClose={vi.fn()}
      onImport={vi.fn()}
      importing={false}
      importError={null}
      imported={imported}
    />,
  );
}

describe("ImportDialog", () => {
  it("shows the tail of a deep source path and carries the whole path in its title", () => {
    renderDialog(DEEP);

    const shown = screen.getByTitle(DEEP);
    expect(shown).toHaveTextContent("incoming-skills/release-notes");
    expect(shown).not.toHaveTextContent("/Users/me/Projects");
  });

  it("reads Update skill while it is replacing a skill of this Harness", () => {
    renderDialog(DEEP, {
      kind: "ready",
      check: { ...CHECK, mode: "update" },
    });

    expect(
      screen.getByRole("heading", { level: 2, name: "Update a skill" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Update skill" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toHaveAccessibleName("Update a skill");
  });

  it("locks the name to the skill the folder came from", () => {
    renderDialog(DEEP, {
      kind: "ready",
      check: { ...CHECK, mode: "update" },
    });

    const field = screen.getByLabelText("Name in the Harness");
    expect(field).toBeDisabled();
    expect(field).toHaveValue("release-notes");
  });

  it("keeps the name editable while it is adding a skill", () => {
    renderDialog(DEEP, { kind: "ready", check: CHECK });

    expect(screen.getByLabelText("Name in the Harness")).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Import skill" }),
    ).toBeInTheDocument();
  });

  it("says the deployed copy is behind until it is deployed again", () => {
    renderDialog(
      DEEP,
      { kind: "ready", check: { ...CHECK, mode: "update" } },
      { mode: "update", name: "release-notes", skipped: 0 },
    );

    expect(
      screen.getByText(/deploy it again/, { exact: false }),
    ).toBeInTheDocument();
  });

  it("says nothing has been picked before a folder is chosen", () => {
    renderDialog(null);

    expect(screen.getByText("No folder picked yet")).toBeInTheDocument();
  });
});
