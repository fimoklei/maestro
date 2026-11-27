import type {
  HarnessChange,
  HarnessStageRow,
  PrimitiveRef,
} from "@maestro/core";
import type { OpenedPrompt } from "./use-edit-prompt-flow";

type RestoreTarget = PrimitiveRef & {
  path: string;
  commit: string;
  hasRequest: boolean;
};

type DiscardTarget = PrimitiveRef & {
  path: string;
  seenRemoteTree: string;
};

export type LocalDeletionTarget = PrimitiveRef & {
  path: string;
  localOnly: boolean;
};

export type WithdrawTarget = Pick<HarnessStageRow, "type" | "name"> & {
  branch: string;
  number: number | null;
};

export type ReleaseWithdrawalTarget = Pick<HarnessStageRow, "type" | "name"> & {
  path: string;
  change: HarnessChange;
  previousName: string | null;
  mergedRequest: number | null;
};

export type ReleaseWithdrawalItem = ReleaseWithdrawalTarget &
  Pick<HarnessStageRow, "openRequests" | "openByOther">;

export type HarnessDialogPayloads = {
  release: undefined;
  "import-skills": undefined;
  "import-prompts": undefined;
  "edit-prompt": OpenedPrompt;
  deletion: HarnessStageRow & PrimitiveRef;
  "local-deletion": LocalDeletionTarget;
  restore: RestoreTarget;
  discard: DiscardTarget;
  withdraw: WithdrawTarget;
  "release-withdrawal": ReleaseWithdrawalTarget;
};
