import {
  LocalDeletionDialog,
  type LocalDeletionTarget,
} from "../harness/harness-dialogs";
import { proposalRow } from "../harness/harness-route";
import {
  type LocalDeletionContext,
  localDeletionNotice,
} from "../harness/local-deletion-copy";
import { useDeleteLocalPrimitive } from "../harness/use-harness";
import {
  useScreenReport,
  useWriteAction,
  type WriteResult,
} from "../ui/use-write-action";

/** Step 1 of a deletion started on an Inventory view, with its own write (#1385). */
export function PaneDeletion({
  target,
  screen,
  onClose,
  onDeleted,
}: {
  target: LocalDeletionTarget;
  screen: Exclude<LocalDeletionContext["screen"], "harness">;
  onClose: () => void;
  /** Takes the result to the Harness view, where the row's next step is. */
  onDeleted: (written: WriteResult) => void;
}) {
  // Its own write, so a refusal names this screen's controls.
  const write = useWriteAction(useDeleteLocalPrimitive(), {
    report: useScreenReport(),
    action: "delete",
    subject: () => ({
      name: target.name,
      row: proposalRow({ type: target.type, name: target.name }),
    }),
    handOver: onDeleted,
    failure: (error) =>
      localDeletionNotice(error, {
        type: target.type,
        name: target.name,
        screen,
      }),
  });
  return (
    <LocalDeletionDialog
      target={target}
      screen={screen}
      write={write}
      onClose={onClose}
      // The hand-over leaves this screen; closing the dialog first would
      // show its pane again before Harness paints.
      onDeleted={() => {}}
    />
  );
}
