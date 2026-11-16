import type { PrimitiveRef } from "@maestro/core";
import type { WithdrawTarget } from "./harness-dialogs";
import { proposalTargetOf, useWithdrawCheck } from "./use-harness";
import type { useHarnessPresses } from "./use-harness-presses";
import { type UnproposedCheck, WithdrawDialog } from "./withdraw-dialog";

type HostProps = {
  target: WithdrawTarget;
  write: ReturnType<typeof useHarnessPresses>["proposalWrite"];
  onClose: () => void;
};

// The categories list is built from the config, never the clone, so its
// withdrawal loses no file and checks none.
export function WithdrawDialogHost(props: HostProps) {
  const { type, name } = props.target;
  return type === "categories" ? (
    <Confirm {...props} unproposed={{ kind: "read", files: [] }} />
  ) : (
    <CheckedWithdrawDialog {...props} primitive={{ type, name }} />
  );
}

// Reads the files the withdrawal would lose while the confirmation stands.
function CheckedWithdrawDialog({
  primitive,
  ...props
}: HostProps & { primitive: PrimitiveRef }) {
  const check = useWithdrawCheck(primitive);
  return (
    <Confirm
      {...props}
      unproposed={
        check.isPending
          ? { kind: "checking" }
          : check.isError
            ? { kind: "failed" }
            : { kind: "read", files: check.data.files }
      }
    />
  );
}

function Confirm({
  target,
  write,
  onClose,
  unproposed,
}: HostProps & { unproposed: UnproposedCheck }) {
  return (
    <WithdrawDialog
      type={target.type}
      name={target.name}
      branch={target.branch}
      number={target.number}
      unproposed={unproposed}
      onClose={onClose}
      onConfirm={() =>
        write.run(
          {
            action: "withdraw",
            ...proposalTargetOf(target),
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
