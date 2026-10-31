import type { WithdrawTarget } from "./harness-dialogs";
import { useWithdrawCheck } from "./use-harness";
import type { useHarnessPresses } from "./use-harness-presses";
import { WithdrawDialog } from "./withdraw-dialog";

// Reads the files the withdrawal would lose while the confirmation stands.
export function WithdrawDialogHost({
  target,
  write,
  onClose,
}: {
  target: WithdrawTarget;
  write: ReturnType<typeof useHarnessPresses>["proposalWrite"];
  onClose: () => void;
}) {
  const check = useWithdrawCheck({ type: target.type, name: target.name });
  return (
    <WithdrawDialog
      type={target.type}
      name={target.name}
      branch={target.branch}
      number={target.number}
      unproposed={
        check.isPending
          ? { kind: "checking" }
          : check.isError
            ? { kind: "failed" }
            : { kind: "read", files: check.data.files }
      }
      onClose={onClose}
      onConfirm={() =>
        write.run(
          {
            action: "withdraw",
            type: target.type,
            name: target.name,
            number: target.number,
          },
          { onSuccess: onClose },
        )
      }
      withdrawing={write.phase === "running"}
      withdrawError={write.failure}
    />
  );
}
