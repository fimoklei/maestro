import { HttpError } from "../api/http";
import type { DeployTarget } from "../inventory/use-deploy-skill";
import { useScreenWrites, useWriteAction } from "../ui/use-write-action";
import {
  globalUpdateNotice,
  updateNotice,
  updatePreviewNotice,
} from "./notice-copy";
import { type UpdateRunView, updateRows } from "./update-outcome-report";
import { UpdateTargetDialog } from "./update-target-dialog";
import { useGlobalDeployState } from "./use-global-deploy-state";
import { useRetryOperation } from "./use-retry-operation";
import { useUpdatePreflight } from "./use-update-preflight";
import { useUpdateTarget } from "./use-update-target";
import { writeReportIn } from "./write-report-body";

export function UpdateTargetAction({
  targetName,
  target,
  add,
  onClose,
}: {
  targetName: string;
  target: DeployTarget;
  add?: string;
  onClose: () => void;
}) {
  const update = useUpdateTarget();
  const preflight = useUpdatePreflight(target, update.data === undefined, add);
  const preview = preflight.data?.preview ?? null;
  // Writes to names the folders the Deploy-state read found, never a guess.
  const globalRead = useGlobalDeployState(target.kind === "global");
  const screen = useScreenWrites();
  // Both writes name nothing: the dialog's Report states the outcome, failed
  // or not.
  const retry = useRetryOperation(screen, () =>
    preview === null
      ? null
      : {
          operation: { kind: "update", release: preview.chosenRelease },
          subject: null,
        },
  );
  const global = target.kind === "global";
  const updateWrite = useWriteAction(update, {
    screen,
    action: "update",
    subject: () => null,
    failure: (error) =>
      writeReportIn(error) !== null
        ? null
        : global
          ? globalUpdateNotice(error).notice
          : updateNotice(error),
  });
  // A completed Retry update reads the folders again; its read replaces the run's.
  const retried = global ? (retry.landed(target)?.report ?? null) : null;
  const report = retried ?? update.data?.report ?? writeReportIn(update.error);
  const outcome: UpdateRunView | null =
    report !== null
      ? global
        ? { kind: "folders", report }
        : { kind: "skills", rows: updateRows(report) }
      : global && update.isError && globalUpdateNotice(update.error).unknown
        ? { kind: "unknown" }
        : null;

  return (
    <UpdateTargetDialog
      targetName={targetName}
      folders={
        target.kind === "global" ? (globalRead.data?.folders ?? []) : null
      }
      preview={preview}
      isLoading={preflight.isPending}
      isRunning={updateWrite.phase === "running" || retry.isRetrying(target)}
      outcome={outcome}
      incomplete={
        outcome !== null &&
        outcome.kind !== "unknown" &&
        update.isError &&
        retried === null
      }
      onRetry={() => retry.run(target)}
      // An origin-less Harness cannot attribute the target's release, so
      // no update can be priced (#960).
      blocked={
        preflight.error instanceof HttpError &&
        preflight.error.code === "inventory-origin-unavailable"
      }
      error={
        retry.failure(target) ??
        (preflight.isError
          ? updatePreviewNotice(preflight.error)
          : updateWrite.failure)
      }
      onCancel={onClose}
      onConfirm={() =>
        preview === null
          ? undefined
          : updateWrite.run({
              target,
              token: preview.token,
              ...(add === undefined ? {} : { add }),
              ...(preview.copyReceipt === null
                ? {}
                : { confirmedCopyReceipt: preview.copyReceipt }),
            })
      }
    />
  );
}
