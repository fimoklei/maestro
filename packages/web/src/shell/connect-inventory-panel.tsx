import { type ReactNode, useState } from "react";
import {
  connectErrorMessage,
  isNoUsableOriginError,
} from "../inventory/connect-error-message";
import {
  type ConnectResponse,
  useConnectInventory,
} from "../inventory/use-connect-inventory";
import { BrowseDialog } from "./browse-dialog";
import { ConnectInventoryForm } from "./connect-inventory-form";
import { useBrowsePicker } from "./use-browse-picker";

// The connect exchange, owned once: the shared plumbing both the connect gate's
// connect step and the ⚙ Inventory source re-point step used to copy — the
// path state, the connect mutation, the error translation, the browse picker
// and its dialog, all feeding the shared ConnectInventoryForm. What stays out
// is what genuinely forks: each caller's post-success moment (ADR-0015 keeps
// the gate and Settings deliberately different).
//
// The fork is a slot, not a flag. onSuccess always fires when the mutation
// resolves — Settings uses it to drop back to its connected view. renderSuccess
// is optional: supply it (the connect gate) and the panel shows it in place of
// the form once connected — the confirmation with its read-only promise; omit
// it (Settings) and the panel shows nothing after success, leaning on onSuccess
// alone. The mutation's result is handed to both so a caller can name the count
// or the new path without re-reading it.
//
// The panel owns the connect mutation, so a caller that unmounts it (Settings,
// on cancel or success) gets a clean slate on the next mount for free — no
// explicit reset. The first-run redirect guard is not here: it decides whether
// the gate mounts the panel at all, so it stays in the gate wrapper.
type ConnectInventoryPanelProps = {
  // Seeds the path field once, at mount. Settings passes the current source so
  // it can be edited in place; the connect gate leaves it empty.
  initialPath?: string;
  onSuccess?: (result: ConnectResponse) => void;
  renderSuccess?: (result: ConnectResponse) => ReactNode;
  // Passed straight to the form (see ConnectInventoryForm): the re-point flow
  // relabels submit and pairs a Cancel with it; the gate takes the defaults.
  submitLabel?: string;
  secondaryAction?: ReactNode;
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
  // Connect mode confirms exactly one path; the list shape is the dialog's.
  const browse = useBrowsePicker(([selected]) => setPath(selected ?? ""));

  function handleSubmit(submittedPath: string) {
    connect.mutate(submittedPath, {
      onSuccess: (result) => onSuccess?.(result),
    });
  }

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
          noUsableOrigin={isNoUsableOriginError(connect.error)}
          isPending={connect.isPending}
          onBrowse={browse.openBrowse}
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
    </>
  );
}
