import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ComponentProps, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { FolderChooser } from "../ui/use-folder-chooser";
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

// A chooser that answers every Browse with PICKED, as the server's would.
const PICKED = "/Users/me/Downloads/release-notes";
const chooser: FolderChooser = {
  available: true,
  busy: false,
  notice: null,
  browse: (_start, onPicked) => onPicked(PICKED),
};

function renderDialog(
  source: string | null,
  load: ComponentProps<typeof ImportDialog>["load"] = { kind: "idle" },
  imported: ComponentProps<typeof ImportDialog>["imported"] = null,
  onView: ComponentProps<typeof ImportDialog>["onView"] = vi.fn(),
  onClose: ComponentProps<typeof ImportDialog>["onClose"] = vi.fn(),
  onSourceCommit: ComponentProps<
    typeof ImportDialog
  >["onSourceCommit"] = vi.fn(),
) {
  render(
    <SourceHost
      source={source}
      load={load}
      imported={imported}
      onView={onView}
      onClose={onClose}
      onSourceCommit={onSourceCommit}
    />,
  );
  return { onClose };
}

// The field's text is the host's UI-state, as it is in the view.
function SourceHost({
  source,
  load,
  imported,
  onView,
  onClose,
  onSourceCommit,
}: {
  source: string | null;
  load: ComponentProps<typeof ImportDialog>["load"];
  imported: ComponentProps<typeof ImportDialog>["imported"];
  onView: ComponentProps<typeof ImportDialog>["onView"];
  onClose: ComponentProps<typeof ImportDialog>["onClose"];
  onSourceCommit: ComponentProps<typeof ImportDialog>["onSourceCommit"];
}) {
  const [text, setText] = useState(source ?? "");
  return (
    <ImportDialog
      source={source}
      sourceText={text}
      onSourceChange={setText}
      onSourceCommit={onSourceCommit}
      chooser={chooser}
      name="release-notes"
      load={load}
      onNameChange={vi.fn()}
      onClose={onClose}
      onImport={vi.fn()}
      onView={onView}
      importing={false}
      importError={null}
      imported={imported}
    />
  );
}

describe("ImportDialog", () => {
  // Typed work is never thrown away by a stray click (ADR-0033 §6); Escape and
  // Close still close, because those are deliberate.
  it("ignores a click outside once the name has been typed in", async () => {
    const onClose = vi.fn();
    renderDialog(DEEP, { kind: "ready", check: CHECK }, null, vi.fn(), onClose);

    await userEvent.type(
      screen.getByRole("textbox", { name: /name in the harness/i }),
      "x",
    );
    fireEvent.pointerDown(document.body);
    fireEvent.click(document.body);

    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes on a click outside while no field has been touched", async () => {
    const onClose = vi.fn();
    renderDialog(DEEP, { kind: "ready", check: CHECK }, null, vi.fn(), onClose);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    fireEvent.pointerDown(document.body);
    fireEvent.click(document.body);

    expect(onClose).toHaveBeenCalledOnce();
  });

  // The footer every dialog shares (design.md, #1116). An import deletes
  // nothing, so its confirm keeps the neutral fill.
  it("puts Close on the leading side and fills the import confirm", () => {
    renderDialog(DEEP, { kind: "ready", check: CHECK });

    const close = screen.getByRole("button", { name: "Close" });
    expect(close.parentElement?.firstElementChild).toBe(close);
    expect(close.parentElement).toHaveClass("justify-between");
    expect(close.parentElement?.lastElementChild).toHaveClass("bg-gray-12");
  });

  it("holds the whole folder path in the Folder path field", () => {
    renderDialog(DEEP);

    expect(screen.getByRole("textbox", { name: "Folder path" })).toHaveValue(
      DEEP,
    );
    expect(
      screen.getByText(
        "Import copies this folder to the Working Harness. The original folder stays unchanged.",
      ),
    ).toBeInTheDocument();
  });

  it("checks a typed folder once the author leaves the field", async () => {
    const onSourceCommit = vi.fn();
    renderDialog(
      null,
      { kind: "idle" },
      null,
      vi.fn(),
      vi.fn(),
      onSourceCommit,
    );

    await userEvent.type(
      screen.getByRole("textbox", { name: "Folder path" }),
      DEEP,
    );
    expect(onSourceCommit).not.toHaveBeenCalled();
    await userEvent.tab();

    expect(onSourceCommit).toHaveBeenCalledExactlyOnceWith(DEEP);
  });

  it("checks a folder picked through Browse at once", async () => {
    const onSourceCommit = vi.fn();
    renderDialog(
      null,
      { kind: "idle" },
      null,
      vi.fn(),
      vi.fn(),
      onSourceCommit,
    );

    await userEvent.click(screen.getByRole("button", { name: "Browse" }));

    expect(screen.getByRole("textbox", { name: "Folder path" })).toHaveValue(
      PICKED,
    );
    expect(onSourceCommit).toHaveBeenCalledWith(PICKED);
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

  it("keeps the name closed until a folder is chosen", () => {
    renderDialog(null);

    expect(screen.getByRole("textbox", { name: "Folder path" })).toHaveValue(
      "",
    );
    expect(screen.getByLabelText("Name in the Harness")).toBeDisabled();
  });
});
