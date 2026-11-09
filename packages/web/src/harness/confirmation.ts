import type { PrimitiveRef } from "@maestro/core";
import type {
  DiscardTarget,
  LocalDeletionTarget,
  ReleaseWithdrawalTarget,
  RestoreTarget,
  WithdrawTarget,
} from "./harness-dialogs";

type Targets = {
  deletion: PrimitiveRef;
  "local-deletion": LocalDeletionTarget;
  restore: RestoreTarget;
  discard: DiscardTarget;
  withdraw: WithdrawTarget;
  "release-withdrawal": ReleaseWithdrawalTarget;
};

type Kind = keyof Targets;

/** The one confirmation a Harness row press opened, with what it froze at the press. */
export type Confirmation = {
  [K in Kind]: { kind: K; target: Targets[K] };
}[Kind];

export function targetOf<K extends Kind>(
  open: Confirmation | null,
  kind: K,
): Targets[K] | null {
  // TypeScript cannot tie `open.kind === kind` to `Targets[K]`; the check makes
  // `open` the member whose target is `Targets[K]`.
  return open?.kind === kind ? (open.target as Targets[K]) : null;
}

// A dialog's close reaches only its own confirmation, never one opened since.
export function closed(
  open: Confirmation | null,
  kind: Kind,
): Confirmation | null {
  return open?.kind === kind ? null : open;
}
