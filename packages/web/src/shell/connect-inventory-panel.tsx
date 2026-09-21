import { type ReactNode, useState } from "react";
import {
  connectErrorCode,
  scaffoldOfferPath,
} from "../inventory/connect-error-message";
import { connectNotice, scaffoldNotice } from "../inventory/connect-notice";
import {
  type ConnectResponse,
  useConnectInventory,
} from "../inventory/use-connect-inventory";
import { useScaffoldHarness } from "../inventory/use-scaffold-harness";
import { ACTIONS } from "../ui/busy-copy";
import { BrowseDialog } from "./browse-dialog";
import { ConnectInventoryForm } from "./connect-inventory-form";
import { useBrowsePicker } from "./use-browse-picker";

// Shared by the connect gate and the ⚙ re-point step. renderSuccess is a
// slot, not a flag — supply it for an in-place confirmation, omit it to lean
// on onSuccess alone (ADR-0015).
type ConnectInventoryPanelProps = {
  // Seeds the path field once, at mount.
  initialPath?: string;
  onSuccess?: (result: ConnectResponse) => void;
  renderSuccess?: (result: ConnectResponse) => ReactNode;
  submitLabel?: string;
  secondaryAction?: ReactNode;
};

// Every refusal the user clears by picking somewhere else, and the picker that
// clears it. Anything not listed here is a plain field error (#555). The
// heading comes from the notice table, so only the action lives here.
const RECOVERABLE: Record<
  string,
  { actionLabel: string; picker: "path" | "parent" }
> = {
  // Each label runs the last instruction of its row's sentence, with the same
  // verb and the same object (`.claude/rules/copy.md`, F8).
  "no-usable-origin": { actionLabel: "Choose another clone", picker: "path" },
  "destination-occupied": {
    actionLabel: "Choose another folder",
    picker: "parent",
  },
  "destination-partial-clone": {
    actionLabel: "Choose another folder",
    picker: "parent",
  },
};

export function ConnectInventoryPanel({
  initialPath = "",
  onSuccess,
  renderSuccess,
  submitLabel,
  secondaryAction,
}: ConnectInventoryPanelProps) {
  const connect = useConnectInventory();
  const scaffold = useScaffoldHarness();
  const [path, setPath] = useState(initialPath);
  // null until chosen: the server falls back to the home ceiling, so the
  // cockpit never has to know where home is.
  const [cloneParent, setCloneParent] = useState<string | null>(null);
  const browse = useBrowsePicker(([selected]) => setPath(selected ?? ""));
  const parentBrowse = useBrowsePicker(([selected]) =>
    setCloneParent(selected ?? null),
  );

  function handleSubmit(submittedPath: string) {
    scaffold.reset();
    connect.mutate(
      { path: submittedPath, parent: cloneParent ?? undefined },
      { onSuccess: (result) => onSuccess?.(result) },
    );
  }

  // Both routes end the same way, so the success slot does not care which
  // mutation got there (#556).
  const succeeded = scaffold.isSuccess ? scaffold.data : connect.data;
  // A failed scaffold replaces the offer with what went wrong; the field stays
  // editable so another path can be submitted.
  const offerPath = scaffold.error ? null : scaffoldOfferPath(connect.error);
  const recoverable = RECOVERABLE[connectErrorCode(connect.error) ?? ""];

  // A failed scaffold speaks for itself; otherwise the connect refusal does,
  // carrying either its recovery picker or the scaffold offer as its action.
  const notice =
    scaffoldNotice(scaffold.error) ??
    connectNotice(connect.error, {
      // The offer's own detail, replacing the row's: a bare path is not a
      // sentence, and the folder is what the offer is about.
      detail: offerPath
        ? `Maestro would scaffold it into ${offerPath}.`
        : undefined,
      action: offerPath
        ? {
            label: scaffold.isPending
              ? ACTIONS.scaffold.busy
              : "Scaffold the Harness",
            disabled: scaffold.isPending,
            onClick: () =>
              scaffold.mutate(offerPath, {
                onSuccess: (result) => onSuccess?.(result),
              }),
          }
        : recoverable
          ? {
              label: recoverable.actionLabel,
              onClick:
                recoverable.picker === "parent"
                  ? parentBrowse.openBrowse
                  : browse.openBrowse,
            }
          : undefined,
    });

  return (
    <>
      {succeeded && renderSuccess ? (
        renderSuccess(succeeded)
      ) : (
        <ConnectInventoryForm
          path={path}
          onPathChange={setPath}
          onSubmit={handleSubmit}
          notice={notice}
          isPending={connect.isPending}
          submitDisabled={scaffold.isPending}
          onBrowse={browse.openBrowse}
          cloneParent={cloneParent}
          onChooseParent={parentBrowse.openBrowse}
          submitLabel={submitLabel}
          secondaryAction={secondaryAction}
        />
      )}
      {browse.open ? (
        <BrowseDialog
          mode="connect"
          onSelect={browse.selectBrowse}
          onClose={browse.closeBrowse}
        />
      ) : null}
      {parentBrowse.open ? (
        // The same picker, asked a different question: the folder the clone
        // lands *in*, not the Harness itself (#555).
        <BrowseDialog
          mode="clone-parent"
          onSelect={parentBrowse.selectBrowse}
          onClose={parentBrowse.closeBrowse}
        />
      ) : null}
    </>
  );
}
