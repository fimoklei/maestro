import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
  onView: ComponentProps<typeof ImportDialog>["onView"] = vi.fn(),
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
      onView={onView}
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

  it("names an unchanged folder before asking for another one", () => {
    renderDialog(DEEP, {
      kind: "ready",
      check: {
        ...CHECK,
        mode: "update",
        sourceBlocker: "nothing-to-carry-back",
      },
    });

    expect(
      screen.getByRole("heading", { level: 2, name: "No changes to update" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Choose a folder with changes to update the skill."),
    ).toBeInTheDocument();
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

  it("explains that deployed copies still need the updated skill", () => {
    renderDialog(
      DEEP,
      { kind: "ready", check: { ...CHECK, mode: "update" } },
      { mode: "update", name: "release-notes", skipped: 0 },
    );

    expect(
      screen.getByText(
        "The deployed copies still have the earlier version. Select View in Harness, then deploy the skill again.",
      ),
    ).toBeInTheDocument();
  });

  it("confirms the import and offers the way to the row, claiming nothing about release", async () => {
    const onView = vi.fn();
    renderDialog(
      DEEP,
      { kind: "ready", check: CHECK },
      { mode: "add", name: "release-notes", skipped: 0 },
      onView,
    );

    const confirmation = screen.getByText("Skill imported").closest("div")
      ?.parentElement as HTMLElement;
    expect(confirmation).toHaveTextContent(
      "The skill was imported into the Harness. Select View in Harness to find it.",
    );
    expect(confirmation.textContent).not.toMatch(/release/i);

    await userEvent.click(
      screen.getByRole("button", { name: "View in Harness" }),
    );
    expect(onView).toHaveBeenCalledWith("release-notes");
  });

  it("names .git and operating-system files for one skipped entry", () => {
    renderDialog(
      DEEP,
      { kind: "ready", check: CHECK },
      { mode: "add", name: "release-notes", skipped: 1 },
    );

    expect(
      screen.getByText("1 entry was skipped: .git and operating-system files."),
    ).toBeInTheDocument();
  });

  it("names .git and operating-system files for several skipped entries", () => {
    renderDialog(
      DEEP,
      { kind: "ready", check: CHECK },
      { mode: "add", name: "release-notes", skipped: 4 },
    );

    expect(
      screen.getByText(
        "4 entries were skipped: .git and operating-system files.",
      ),
    ).toBeInTheDocument();
  });

  it("says nothing about skipped entries when none were skipped", () => {
    renderDialog(
      DEEP,
      { kind: "ready", check: CHECK },
      { mode: "add", name: "release-notes", skipped: 0 },
    );

    expect(screen.queryByText(/skipped/)).not.toBeInTheDocument();
  });

  it("says nothing has been picked before a folder is chosen", () => {
    renderDialog(null);

    expect(screen.getByText("Choose a skill folder")).toBeInTheDocument();
  });
});
