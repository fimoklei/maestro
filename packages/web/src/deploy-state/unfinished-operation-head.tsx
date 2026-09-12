// The way out of a Deploy or Remove that never finished, on the target card
// that carries it. The record is durable, so this survives a restart until the
// retry converges (ADR-0031, #951).
import { Notice } from "../ui/notice";
import {
  RETRY_DEPLOY,
  RETRY_REMOVAL,
  unfinishedOperationNotice,
} from "./release-head-copy";
import { RETRY_UPDATE } from "./update-target-copy";
import type { DeployedPrimitive, PendingOperation } from "./use-deploy-state";

const RETRY_LABELS: Record<PendingOperation["kind"], string> = {
  deploy: RETRY_DEPLOY,
  remove: RETRY_REMOVAL,
  update: RETRY_UPDATE,
};

export function UnfinishedOperationHead({
  pending,
  primitives = [],
  onRetry,
  isRetrying = false,
}: {
  pending: PendingOperation;
  // What the target holds now, which is how a half-landed update counts what
  // landed (spec story 8).
  primitives?: readonly DeployedPrimitive[];
  onRetry: () => void;
  isRetrying?: boolean;
}) {
  return (
    <div className="border-line-row border-b px-card-x py-row-y">
      <Notice
        trigger="load"
        notice={{
          ...unfinishedOperationNotice(pending, primitives),
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
