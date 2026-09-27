import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ComponentProps, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { NoticeContent } from "../ui/notice";
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
  onClose: ComponentProps<typeof ImportDialog>["onClose"] = vi.fn(),
  onSourceCommit: ComponentProps<
    typeof ImportDialog
  >["onSourceCommit"] = vi.fn(),
  importError: NoticeContent | null = null,
) {
  const onImport = vi.fn();
  render(
    <SourceHost
      source={source}
      load={load}
      onClose={onClose}
      onSourceCommit={onSourceCommit}
      onImport={onImport}
      importError={importError}
    />,
  );
  return { onClose, onImport };
}

// The field's text is the host's UI-state, as it is in the view.
function SourceHost({
  source,
  load,
  onClose,
  onSourceCommit,
  onImport,
  importError,
}: {
  source: string | null;
  load: ComponentProps<typeof ImportDialog>["load"];
  onClose: ComponentProps<typeof ImportDialog>["onClose"];
  onSourceCommit: ComponentProps<typeof ImportDialog>["onSourceCommit"];
  onImport: () => void;
  importError: NoticeContent | null;
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
      onImport={onImport}
      importing={false}
      importError={importError}
    />
  );
}

describe("ImportDialog", () => {
  it("ignores a click outside once the name has been typed in", async () => {
    const onClose = vi.fn();
    renderDialog(DEEP, { kind: "ready", check: CHECK }, onClose);

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
    renderDialog(DEEP, { kind: "ready", check: CHECK }, onClose);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    fireEvent.pointerDown(document.body);
    fireEvent.click(document.body);

    expect(onClose).toHaveBeenCalledOnce();
  });

  // An import deletes nothing, so its confirm keeps the neutral fill (#1116).
  it("offers Cancel before the import and fills the import confirm", () => {
    renderDialog(DEEP, { kind: "ready", check: CHECK });

    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import skill" })).toHaveClass(
      "bg-gray-12",
    );
  });

  it("opens with focus in the Folder path field", async () => {
    renderDialog(null);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(screen.getByRole("textbox", { name: "Folder path" })).toHaveFocus();
  });

  it("states the skill checks as a warning with one line each", () => {
    renderDialog(DEEP, {
      kind: "ready",
      check: { ...CHECK, advisories: ["long-manifest", "long-description"] },
    });

    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent("⚠");
    expect(notice).toHaveTextContent("Skill checks found issues");
    expect(
      within(notice)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual([
      "SKILL.md is over 500 lines.",
      "The description is over 1,024 characters.",
    ]);
  });

  it("states the import failure and offers Close", () => {
    renderDialog(DEEP, { kind: "ready", check: CHECK }, vi.fn(), vi.fn(), {
      level: "error",
      label: "Skill not imported",
      message: "Maestro could not copy the folder.",
    });

    expect(screen.getByText("Skill not imported")).toBeInTheDocument();
    // The ✕ and the leave control.
    expect(screen.getAllByRole("button", { name: "Close" })).toHaveLength(2);
    expect(
      screen.queryByRole("button", { name: "Cancel" }),
    ).not.toBeInTheDocument();
  });

  it("does not import on Enter while the name is refused", async () => {
    const { onImport } = renderDialog(DEEP, {
      kind: "ready",
      check: { ...CHECK, nameBlocker: "name-taken" },
    });

    await userEvent.type(
      screen.getByRole("textbox", { name: /name in the harness/i }),
      "{Enter}",
    );

    expect(onImport).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", {
        name: "Import skill — name cannot be used",
      }),
    ).toHaveAttribute("aria-disabled", "true");
  });

  it("imports on Enter once the check is clean", async () => {
    const { onImport } = renderDialog(DEEP, { kind: "ready", check: CHECK });

    await userEvent.type(
      screen.getByRole("textbox", { name: /name in the harness/i }),
      "{Enter}",
    );

    expect(onImport).toHaveBeenCalledOnce();
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
    renderDialog(null, { kind: "idle" }, vi.fn(), onSourceCommit);

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
    renderDialog(null, { kind: "idle" }, vi.fn(), onSourceCommit);

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

  it("keeps the name closed until a folder is chosen", () => {
    renderDialog(null);

    expect(screen.getByRole("textbox", { name: "Folder path" })).toHaveValue(
      "",
    );
    expect(screen.getByLabelText("Name in the Harness")).toBeDisabled();
  });
});
