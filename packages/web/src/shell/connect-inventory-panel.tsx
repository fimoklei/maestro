import { type ReactNode, useState } from "react";
import {
  connectErrorMessage,
  isNoUsableOriginError,
  scaffoldOfferPath,
} from "../inventory/connect-error-message";
import {
  type ConnectResponse,
  useConnectInventory,
} from "../inventory/use-connect-inventory";
import { useScaffoldHarness } from "../inventory/use-scaffold-harness";
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
  const scaffold = useScaffoldHarness();
  const [path, setPath] = useState(initialPath);
  const browse = useBrowsePicker(([selected]) => setPath(selected ?? ""));

  function handleSubmit(submittedPath: string) {
    scaffold.reset();
    connect.mutate(submittedPath, {
      onSuccess: (result) => onSuccess?.(result),
    });
  }

  // Both routes end the same way, so the success slot does not care which
  // mutation got there (#556).
  const succeeded = scaffold.isSuccess ? scaffold.data : connect.data;
  // A failed scaffold replaces the offer with what went wrong; the field stays
  // editable so another path can be submitted.
  const offerPath = scaffold.error ? null : scaffoldOfferPath(connect.error);

  return (
    <>
      {succeeded && renderSuccess ? (
        renderSuccess(succeeded)
      ) : (
        <ConnectInventoryForm
          path={path}
          onPathChange={setPath}
          onSubmit={handleSubmit}
          error={
            connectErrorMessage(scaffold.error) ??
            connectErrorMessage(connect.error)
          }
          noUsableOrigin={isNoUsableOriginError(connect.error)}
          scaffoldOffer={
            offerPath
              ? {
                  path: offerPath,
                  isPending: scaffold.isPending,
                  onAccept: () =>
                    scaffold.mutate(offerPath, {
                      onSuccess: (result) => onSuccess?.(result),
                    }),
                }
              : undefined
          }
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
