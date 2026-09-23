import { useState } from "react";
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
import type { NoticeContent } from "../ui/notice";
import { useFolderChooser } from "../ui/use-folder-chooser";
import { setLocationMessage } from "./settings-copy";

// The Set Harness location dialog's state: the field, the connect and the
// scaffold offer a connect can come back with. A refusal belongs to the path
// it was given for, so an edit clears it.
export function useSetLocationDialog({
  onSet,
}: {
  /** The stored path, which realpath may have changed from the sent one. */
  onSet: (path: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [path, setPath] = useState("");
  const chooser = useFolderChooser();
  const connect = useConnectInventory();
  const scaffold = useScaffoldHarness();
  const busy = connect.isPending || scaffold.isPending;

  const succeed = (result: ConnectResponse) => {
    setOpen(false);
    onSet(result.inventoryPath);
  };

  const refused =
    connect.isError && connect.variables?.path === path ? connect.error : null;
  const offerPath = scaffold.error ? null : scaffoldOfferPath(refused);
  const notice =
    scaffoldNotice(scaffold.error) ??
    withMessage(
      connectNotice(
        refused,
        scaffoldOfferExtras(offerPath, {
          pending: scaffold.isPending,
          onAccept: () =>
            offerPath && scaffold.mutate(offerPath, { onSuccess: succeed }),
        }),
      ),
      setLocationMessage(connectErrorCode(refused)),
    );

  return {
    open,
    openDialog(current: string) {
      setPath(current);
      connect.reset();
      scaffold.reset();
      setOpen(true);
    },
    busy,
    dialogProps: {
      path,
      onPathChange(next: string) {
        setPath(next);
        // A scaffold failure answered the old path, not this one.
        scaffold.reset();
      },
      chooser,
      notice,
      busy,
      onSet() {
        scaffold.reset();
        // A re-point never clones (#995): the server refuses any URL.
        connect.mutate({ path, localOnly: true }, { onSuccess: succeed });
      },
      onClose() {
        if (!busy) setOpen(false);
      },
    },
  };
}

function withMessage(
  notice: NoticeContent | null,
  message: string | undefined,
): NoticeContent | null {
  return notice === null || message === undefined
    ? notice
    : { ...notice, message };
}
