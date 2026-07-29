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

export function ConnectInventoryPanel({
  initialPath = "",
  onSuccess,
  renderSuccess,
  submitLabel,
  secondaryAction,
}: ConnectInventoryPanelProps) {
  const connect = useConnectInventory();
  const [path, setPath] = useState(initialPath);
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
