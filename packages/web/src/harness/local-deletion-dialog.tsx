import { HttpError } from "../api/http";
import { originName } from "../ui/band-copy";
import { DeletionDialog } from "./deletion-dialog";
import type { LocalDeletionTarget } from "./harness-dialogs";
import {
  deletionCheckNotice,
  type LocalDeletionContext,
} from "./local-deletion-copy";
import { folderInClone, useDeletionCheck, useHarness } from "./use-harness";
import type { useHarnessPresses } from "./use-harness-presses";

type Presses = ReturnType<typeof useHarnessPresses>;

export function LocalDeletionDialog({
  target: { type, name, path, localOnly },
  screen,
  write,
  onClose,
}: {
  target: LocalDeletionTarget;
  screen: LocalDeletionContext["screen"];
  write: Presses["deleteLocalWrite"];
  onClose: () => void;
}) {
  const check = useDeletionCheck();
  const harness = useHarness();
  const context = { type, name, screen };
  const folder = folderInClone(check.data?.[type][name]);
  const seenWorkingTree = folder?.workingTree ?? null;
  const checkFailure = check.isError
    ? deletionCheckNotice("no-answer", context)
    : check.data !== undefined && seenWorkingTree === null
      ? deletionCheckNotice("already-gone", context)
      : null;
  return (
    <DeletionDialog
      type={type}
      name={name}
      mode={{
        kind: "local",
        origin:
          harness.data === undefined
            ? "the Harness"
            : originName(harness.data.origin),
        screen,
        path,
        check: check.isFetching
          ? "checking"
          : seenWorkingTree !== null
            ? "ready"
            : check.isError
              ? "failed"
              : "not-in-clone",
        localOnly,
        uncommitted: folder?.uncommitted === true,
      }}
      onClose={onClose}
      onConfirm={() =>
        seenWorkingTree !== null &&
        write.run(
          { type, name, seenWorkingTree },
          {
            onSuccess: screen === "harness" ? onClose : undefined,
            onError: (error) => {
              if (
                error instanceof HttpError &&
                error.code === "confirmation-stale"
              ) {
                void check.refetch();
              }
            },
          },
        )
      }
      deleting={write.phase === "running"}
      deleteError={write.failure ?? checkFailure}
    />
  );
}
