import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { renderWithQuery } from "../test-utils";
import { ActionsMenu } from "./actions-menu";
import { Button } from "./button";
import { Dialog } from "./dialog";
import { DialogSlot } from "./dialog-slot";
import { useDialogSlot } from "./use-dialog-slot";

function RenameDialog({
  onClose,
  onRemove,
}: {
  onClose: () => void;
  onRemove: () => void;
}) {
  const [name, setName] = useState("");
  return (
    <Dialog
      title="Rename"
      version={null}
      width={480}
      phase="idle"
      action={null}
      failure={null}
      describedBy={null}
      fieldsChanged={name !== ""}
      onClose={onClose}
    >
      <label>
        New name
        <input value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <Button variant="quiet" onClick={onRemove}>
        Remove instead
      </Button>
    </Dialog>
  );
}

function RemoveDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog
      title="Remove"
      version={null}
      width={480}
      phase="idle"
      action={null}
      failure={null}
      describedBy={null}
      fieldsChanged={false}
      onClose={onClose}
    >
      <p>Removes the row.</p>
    </Dialog>
  );
}

function Screen() {
  const dialog = useDialogSlot<"rename" | "remove">();
  const closeRename = () => dialog.close("rename");
  const closeRemove = () => dialog.close("remove");
  return (
    <>
      <Button variant="quiet" onClick={() => dialog.open("rename")}>
        Rename
      </Button>
      <ActionsMenu
        label="More"
        items={[{ label: "Remove", onSelect: () => dialog.open("remove") }]}
      />
      <DialogSlot
        standing={dialog.standing}
        dialogs={{
          rename: () => (
            <RenameDialog
              onClose={closeRename}
              onRemove={() => {
                dialog.open("remove");
                closeRename();
              }}
            />
          ),
          remove: () => <RemoveDialog onClose={closeRemove} />,
        }}
      />
    </>
  );
}

const closed = () =>
  waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

describe("DialogSlot", () => {
  it("mounts no dialog until one is opened", () => {
    renderWithQuery(<Screen />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("holds one dialog: opening a second replaces the first", async () => {
    const user = userEvent.setup();
    renderWithQuery(<Screen />);
    await user.click(screen.getByRole("button", { name: "Rename" }));
    const rename = await screen.findByRole("dialog", { name: "Rename" });

    await user.click(
      within(rename).getByRole("button", { name: "Remove instead" }),
    );

    await screen.findByRole("dialog", { name: "Remove" });
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });

  it("forgets a dialog's fields once it closes", async () => {
    const user = userEvent.setup();
    renderWithQuery(<Screen />);
    await user.click(screen.getByRole("button", { name: "Rename" }));
    const first = await screen.findByRole("dialog", { name: "Rename" });
    await user.type(within(first).getByLabelText("New name"), "notes");
    await user.click(within(first).getByRole("button", { name: "Cancel" }));
    await closed();

    await user.click(screen.getByRole("button", { name: "Rename" }));
    const again = await screen.findByRole("dialog", { name: "Rename" });
    expect(within(again).getByLabelText("New name")).toHaveValue("");
  });

  it("returns focus to the button that opened the dialog", async () => {
    const user = userEvent.setup();
    renderWithQuery(<Screen />);
    const opener = screen.getByRole("button", { name: "Rename" });
    await user.click(opener);
    const dialog = await screen.findByRole("dialog", { name: "Rename" });

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await closed();
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it("returns focus to the menu's trigger when a menu item, now gone, opened the dialog", async () => {
    const user = userEvent.setup();
    renderWithQuery(<Screen />);
    const trigger = screen.getByRole("button", { name: "More" });
    await user.click(trigger);
    await user.click(await screen.findByRole("menuitem", { name: "Remove" }));
    const dialog = await screen.findByRole("dialog", { name: "Remove" });
    expect(screen.queryByRole("menuitem")).toBeNull();

    await user.keyboard("{Escape}");

    expect(dialog).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
