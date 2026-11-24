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
import { ACTIONS } from "../ui/busy-copy";
import type { NoticeContent } from "../ui/notice";
import { useFolderChooser } from "../ui/use-folder-chooser";
import { setLocationMessage } from "./settings-copy";

export function useSetLocationFlow({
  current,
  report,
  onSet,
  onClose,
}: {
  current: string;
  report: (write: string) => void;
  onSet: (path: string) => void;
  onClose: () => void;
}) {
  const [path, setPath] = useState(current);
  const chooser = useFolderChooser();
  const connect = useConnectInventory();
  const scaffold = useScaffoldHarness();
  const busy = connect.isPending || scaffold.isPending;

  const succeed = (result: ConnectResponse) => {
    onClose();
    onSet(result.inventoryPath);
  };
  const failed = () => report("");

  const runScaffold = (offered: string) => {
    report(ACTIONS.setLocation.busy);
    scaffold.mutate(offered, { onSuccess: succeed, onError: failed });
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
          onAccept: () => offerPath && runScaffold(offerPath),
        }),
      ),
      setLocationMessage(connectErrorCode(refused)),
    );

  return {
    path,
    onPathChange(next: string) {
      setPath(next);
      scaffold.reset();
    },
    chooser,
    notice,
    busy,
    onSet() {
      scaffold.reset();
      report(ACTIONS.setLocation.busy);
      connect.mutate(
        { path, localOnly: true },
        { onSuccess: succeed, onError: failed },
      );
    },
    onClose() {
      if (!busy) onClose();
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
