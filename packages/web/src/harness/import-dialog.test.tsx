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
  onClose: ComponentProps<typeof ImportDialog>["onClose"] = vi.fn(),
  onSourceCommit: ComponentProps<
    typeof ImportDialog
  >["onSourceCommit"] = vi.fn(),
) {
  render(
    <SourceHost
      source={source}
      load={load}
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
  onClose,
  onSourceCommit,
}: {
  source: string | null;
  load: ComponentProps<typeof ImportDialog>["load"];
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
      importing={false}
      importError={null}
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
