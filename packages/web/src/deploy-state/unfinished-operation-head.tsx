// The way out of a Deploy or Remove that never finished, on the target card
// that carries it. The record is durable, so this survives a restart until the
// retry converges (ADR-0031, #951).
import { Notice } from "../ui/notice";
import { unfinishedOperationNotice } from "./release-head-copy";
import { RETRY_UPDATE } from "./update-target-copy";
import type { PendingOperation } from "./use-deploy-state";

// One label per operation, each naming the operation that stopped (copy.md).
const RETRY_LABELS: Record<PendingOperation["kind"], string> = {
  deploy: "Retry deploy",
  remove: "Retry removal",
  update: RETRY_UPDATE,
};

export function UnfinishedOperationHead({
  pending,
  onRetry,
  isRetrying = false,
}: {
  pending: PendingOperation;
  onRetry: () => void;
  isRetrying?: boolean;
}) {
  return (
    <div className="border-line-row border-b px-card-x py-row-y">
      <Notice
        trigger="load"
        notice={{
          ...unfinishedOperationNotice(pending),
          action: {
            label: RETRY_LABELS[pending.kind],
            onClick: onRetry,
            disabled: isRetrying,
          },
        }}
      />
    </div>
  );
}
