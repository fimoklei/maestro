import type { ReleaseWithdrawalItem } from "./harness-dialogs";
import { releaseWithdrawalNotice } from "./notice-copy";
import { ReleaseWithdrawalDialog } from "./release-withdrawal-dialog";
import { useReleaseWithdrawalCheck } from "./use-harness";
import type { useHarnessPresses } from "./use-harness-presses";

// Mounted only while the dialog stands, so every opening reads the token
// afresh.
export function ReleaseWithdrawalDialogHost({
  target,
  write,
  onClose,
}: {
  target: ReleaseWithdrawalItem;
  write: ReturnType<typeof useHarnessPresses>["releaseWithdrawalWrite"];
  onClose: () => void;
}) {
  const ref = { type: target.type, name: target.name };
  const check = useReleaseWithdrawalCheck(ref);
  const refused = check.isError
    ? releaseWithdrawalNotice(check.error, target)
    : null;
  return (
    <ReleaseWithdrawalDialog
      target={target}
      check={
        refused !== null
          ? { kind: "refused", notice: refused }
          : check.data === undefined
            ? { kind: "checking" }
            : { kind: "read" }
      }
      onClose={onClose}
      onConfirm={() =>
        check.data !== undefined &&
        write.run(
          { ...ref, confirmation: check.data.confirmation },
          // Closes on success only: a refusal is stated in the dialog.
          { onSuccess: onClose },
        )
      }
      withdrawing={write.phase === "running"}
      withdrawError={write.failure}
    />
  );
}
