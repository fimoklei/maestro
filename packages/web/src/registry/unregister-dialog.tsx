import { useId } from "react";
import { Dialog } from "../ui/dialog";
import type { NoticeContent } from "../ui/notice";
import {
  UNREGISTER_REPOSITORY,
  UNREGISTER_WHAT_STAYS,
  UNREGISTER_WHAT_STOPS,
  unregisterTitle,
} from "./repositories-copy";

// What stops, then what stays. The host owns the mutation.
export function UnregisterDialog({
  name,
  phase,
  failure,
  onConfirm,
  onClose,
}: {
  name: string;
  phase: "idle" | "running";
  failure: NoticeContent | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const bodyId = useId();

  return (
    <Dialog
      title={unregisterTitle(name)}
      version={null}
      width={480}
      phase={phase}
      action={{
        label: UNREGISTER_REPOSITORY,
        verb: "unregister",
        tone: "danger",
        unavailable: null,
        onRun: onConfirm,
      }}
      failure={failure}
      describedBy={bodyId}
      fieldsChanged={false}
      onClose={onClose}
    >
      <div id={bodyId} className="flex flex-col gap-cell">
        <p className="m-0">{UNREGISTER_WHAT_STOPS}</p>
        <p className="m-0 text-gray-11">{UNREGISTER_WHAT_STAYS}</p>
      </div>
    </Dialog>
  );
}
