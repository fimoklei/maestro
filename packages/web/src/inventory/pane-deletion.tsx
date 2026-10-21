import {
  LocalDeletionDialog,
  type LocalDeletionTarget,
} from "../harness/harness-dialogs";
import {
  type LocalDeletionContext,
  localDeletionNotice,
} from "../harness/local-deletion-copy";
import { useDeleteLocalSkill } from "../harness/use-harness";
import { useScreenReport, useWriteAction } from "../ui/use-write-action";

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
  onDeleted: () => void;
}) {
  // Its own write, so a refusal names this screen's controls.
  const write = useWriteAction(useDeleteLocalSkill(), {
    report: useScreenReport(),
    action: "delete",
    show: "row",
    // The Harness view's row states the outcome.
    name: () => null,
    failure: (error) =>
      localDeletionNotice(error, {
        type: target.type,
        name: target.skill,
        screen,
      }),
  });
  return (
    <LocalDeletionDialog
      target={target}
      screen={screen}
      write={write}
      onClose={onClose}
      onDeleted={onDeleted}
    />
  );
}
