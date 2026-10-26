import type { ReleaseWithdrawalTarget } from "./harness-dialogs";
import { releaseWithdrawalNotice } from "./notice-copy";
import { ReleaseWithdrawalDialog } from "./release-withdrawal-dialog";
import { useReleaseWithdrawalCheck } from "./use-harness";
import type { useHarnessPresses } from "./use-harness-presses";

// Mounted only while the dialog stands, so every opening reads the files and
// the token afresh.
export function ReleaseWithdrawalDialogHost({
  target,
  write,
  onClose,
}: {
  target: ReleaseWithdrawalTarget;
  write: ReturnType<typeof useHarnessPresses>["releaseWithdrawalWrite"];
  onClose: () => void;
}) {
  const ref = { type: target.type, name: target.name };
  const check = useReleaseWithdrawalCheck(ref);
  const refused = check.isError
    ? releaseWithdrawalNotice(check.error, ref)
    : null;
  return (
    <ReleaseWithdrawalDialog
      type={target.type}
      name={target.name}
      change={target.change}
      previousName={target.previousName}
      check={
        refused !== null
          ? { kind: "refused", notice: refused }
          : check.data === undefined
            ? { kind: "checking" }
            : { kind: "read", files: check.data.files }
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
