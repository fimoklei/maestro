// Retries at the release and Selection the server recorded (#951, #1363).
import type { PendingOperation } from "@maestro/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { requestJson } from "../api/http";
import {
  type DeployTarget,
  invalidateTarget,
  sameTarget,
} from "../inventory/use-deploy-skill";
import { useWriteAction } from "../ui/use-write-action";
import { type DeployStateNotice, retryNotice } from "./notice-copy";

/** What a retry re-runs, and the name its done sentence states, if any. */
export type Retried = {
  operation: Pick<PendingOperation, "kind" | "release">;
  name: string | null;
};

type RetryVariables = Retried & { target: DeployTarget };

type RetryResponse = { completed: PendingOperation };

export type RetryOperation = {
  run: (target: DeployTarget) => void;
  isRetrying: (target: DeployTarget) => boolean;
  /** The last retry's failure on this target, until the next retry starts. */
  failure: (target: DeployTarget) => DeployStateNotice | null;
  reset: () => void;
};

export function useRetryOperation(
  report: (write: string) => void,
  /** Null where the target holds no unfinished operation: nothing runs. */
  retried: (target: DeployTarget) => Retried | null,
): RetryOperation {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: ({ target }: RetryVariables) =>
      requestJson<RetryResponse>("/api/deploy/retry", {
        method: "POST",
        body: JSON.stringify({ target }),
      }),
    // A failed retry may still have moved files, so the row re-reads either way.
    onSettled: (_data, _error, { target }) =>
      invalidateTarget(queryClient, target),
  });
  const write = useWriteAction(mutation, {
    report,
    action: ({ operation }) => operation.kind,
    show: "row",
    name: (_data, { name }) => name,
    failure: (error) =>
      mutation.variables
        ? retryNotice(error, mutation.variables.operation)
        : null,
  });
  const isFor = (target: DeployTarget) =>
    sameTarget(mutation.variables?.target, target);
  return {
    run: (target) => {
      const run = retried(target);
      if (run !== null) write.run({ ...run, target });
    },
    isRetrying: (target) => mutation.isPending && isFor(target),
    failure: (target) => (isFor(target) ? write.failure : null),
    reset: mutation.reset,
  };
}
