import { type ReactNode, useState } from "react";
import {
  connectErrorCode,
  connectErrorMessage,
} from "../inventory/connect-error-message";
import {
  type ConnectResponse,
  useConnectInventory,
} from "../inventory/use-connect-inventory";
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
// clears it. Anything not listed here is a plain field error (#555).
const RECOVERABLE: Record<
  string,
  { title: string; actionLabel: string; picker: "path" | "parent" }
> = {
  "no-usable-origin": {
    title: "no usable git origin",
    actionLabel: "browse again…",
    picker: "path",
  },
  "destination-occupied": {
    title: "that folder is taken",
    actionLabel: "choose another folder…",
    picker: "parent",
  },
  "destination-partial-clone": {
    title: "a half-finished clone is in the way",
    actionLabel: "choose another folder…",
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
  const [path, setPath] = useState(initialPath);
  // null until chosen: the server falls back to the home ceiling, so the
  // cockpit never has to know where home is.
  const [cloneParent, setCloneParent] = useState<string | null>(null);
  const browse = useBrowsePicker(([selected]) => setPath(selected ?? ""));
  const parentBrowse = useBrowsePicker(([selected]) =>
    setCloneParent(selected ?? null),
  );

  function handleSubmit(submittedPath: string) {
    connect.mutate(
      { path: submittedPath, parent: cloneParent ?? undefined },
      { onSuccess: (result) => onSuccess?.(result) },
    );
  }

  const recoverable = RECOVERABLE[connectErrorCode(connect.error) ?? ""];

  return (
    <>
      {connect.isSuccess && renderSuccess ? (
        renderSuccess(connect.data)
      ) : (
        <ConnectInventoryForm
          path={path}
          onPathChange={setPath}
          onSubmit={handleSubmit}
          error={connectErrorMessage(connect.error)}
          recovery={
            recoverable
              ? {
                  title: recoverable.title,
                  actionLabel: recoverable.actionLabel,
                  onAction:
                    recoverable.picker === "parent"
                      ? parentBrowse.openBrowse
                      : browse.openBrowse,
                }
              : null
          }
          isPending={connect.isPending}
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
