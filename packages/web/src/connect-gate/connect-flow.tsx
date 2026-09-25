import { type ReactNode, useState } from "react";
import {
  connectErrorCode,
  scaffoldOfferPath,
} from "../inventory/connect-error-message";
import {
  connectNotice,
  scaffoldNotice,
  scaffoldOfferExtras,
} from "../inventory/connect-notice";
import {
  type ConnectResponse,
  useConnectInventory,
} from "../inventory/use-connect-inventory";
import { useScaffoldHarness } from "../inventory/use-scaffold-harness";
import { previewCloneChild } from "../shell/clone-destination-preview";
import { useFolderChooser } from "../ui/use-folder-chooser";
import { ConnectForm } from "./connect-form";

// The refusals of the clone folder: stated under that field, not the path's,
// and cleared by choosing another folder there (#1013).
const CLONE_REFUSALS = new Set([
  "invalid-parent",
  "destination-occupied",
  "destination-partial-clone",
]);

// Supply renderSuccess for an in-place confirmation; omit it to rely on
// onSuccess alone.
type ConnectFlowProps = {
  onSuccess?: (result: ConnectResponse) => void;
  renderSuccess?: (result: ConnectResponse) => ReactNode;
};

export function ConnectFlow({ onSuccess, renderSuccess }: ConnectFlowProps) {
  const connect = useConnectInventory();
  const scaffold = useScaffoldHarness();
  const pathChooser = useFolderChooser();
  const cloneChooser = useFolderChooser();
  const [path, setPath] = useState("");
  const [cloneParent, setCloneParent] = useState("");
  const [cloneOpen, setCloneOpen] = useState(false);

  function handleSubmit() {
    scaffold.reset();
    // Only a URL is cloned; a folder the reader can no longer see stays home.
    const parent = previewCloneChild(path) === null ? "" : cloneParent.trim();
    connect.mutate(
      // Omitted, the server clones into the home folder (#555).
      { path, parent: parent === "" ? undefined : parent },
      { onSuccess: (result) => onSuccess?.(result) },
    );
  }

  const succeeded = scaffold.isSuccess ? scaffold.data : connect.data;
  if (succeeded && renderSuccess) return renderSuccess(succeeded);

  const code = connectErrorCode(connect.error) ?? "";
  const cloneRefused = scaffold.error === null && CLONE_REFUSALS.has(code);
  // A failed scaffold replaces the offer with what went wrong; the field stays
  // editable so another path can be submitted.
  const offerPath = scaffold.error ? null : scaffoldOfferPath(connect.error);

  const cloneNotice = cloneRefused
    ? connectNotice(connect.error, {
        action: !cloneOpen
          ? {
              label: "Choose another folder",
              onClick: () => setCloneOpen(true),
            }
          : undefined,
      })
    : null;

  const notice = cloneRefused
    ? null
    : (scaffoldNotice(scaffold.error) ??
      connectNotice(
        connect.error,
        offerPath
          ? scaffoldOfferExtras(offerPath, {
              pending: scaffold.isPending,
              onAccept: () =>
                scaffold.mutate(offerPath, {
                  onSuccess: (result) => onSuccess?.(result),
                }),
            })
          : code === "no-usable-origin" && pathChooser.available
            ? {
                action: {
                  label: "Choose another clone",
                  onClick: () => pathChooser.browse(path, setPath),
                },
              }
            : {},
      ));

  return (
    <ConnectForm
      path={path}
      onPathChange={setPath}
      pathChooser={pathChooser}
      notice={notice}
      cloneParent={cloneParent}
      onCloneParentChange={setCloneParent}
      cloneChooser={cloneChooser}
      cloneNotice={cloneNotice}
      cloneOpen={cloneOpen}
      onOpenClone={() => setCloneOpen(true)}
      onSubmit={handleSubmit}
      isPending={connect.isPending}
      submitDisabled={scaffold.isPending}
    />
  );
}
