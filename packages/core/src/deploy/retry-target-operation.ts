// The way out of an operation that never finished: run the saved release and
// desired Selection again, under the same target lock and behind a fresh
// local-copy check. Recovery survives a restart because the intent is on disk,
// not in this process (ADR-0031, #951).
import type { ToolPresencePort } from "../tools/tool-presence-port";
import type { SelectionWriter } from "./apply-selection";
import type { DeployedContentPort, DeployTarget } from "./deploy-skill";
import { GLOBAL_LOCK_KEY, type InFlightLocks } from "./in-flight-locks";
import { type CopyVerdict, LocalCopyGuard } from "./local-copy-guard";
import type { TargetOperation, TargetOperationKind } from "./target-operation";

// What the cockpit shows beside *Retry deploy* or *Retry removal*: the
// operation, the release it was going to, and the Selection it wanted.
export type PendingOperation = {
  kind: TargetOperationKind;
  release: string;
  desired: readonly string[];
};

export type RetryTargetOperationError =
  | "repo-not-registered"
  | "nothing-to-retry"
  | "retry-in-progress"
  | "deployed-diverged-from-lock"
  | "deployed-unverifiable"
  | "deployed-unreadable"
  | "lockfile-malformed"
  | "manifest-not-recognised"
  // The rerun still did not reach the desired Selection; the record stays and
  // the retry can be offered again.
  | "retry-incomplete"
  | "retry-failed";

export type RetryTargetOperationResult =
  | { ok: true; completed: PendingOperation }
  | {
      ok: false;
      error: RetryTargetOperationError;
      // Present only where consent can clear the refusal: content that changed
      // since the interruption retires the old receipt, so a retry never
      // reuses permission for different content (#952).
      copyReceipt?: string;
    };

const COPY_ERRORS: Record<
  Exclude<CopyVerdict, "clean">,
  RetryTargetOperationError
> = {
  "local-edits": "deployed-diverged-from-lock",
  unverified: "deployed-unverifiable",
  unreadable: "deployed-unreadable",
  "lockfile-malformed": "lockfile-malformed",
};

export class RetryTargetOperation {
  private readonly deps: {
    registry: { isRegistered(path: string): Promise<boolean> };
    selection: SelectionWriter;
    copyGuard?: Pick<LocalCopyGuard, "check" | "admits">;
    deployedContent: Pick<DeployedContentPort, "classify" | "contentDigest">;
    toolPresence: ToolPresencePort;
    canonicalPath: (path: string) => Promise<string>;
    locks: InFlightLocks;
  };

  private readonly copyGuard: Pick<LocalCopyGuard, "check" | "admits">;

  constructor(deps: RetryTargetOperation["deps"]) {
    this.deps = deps;
    this.copyGuard =
      deps.copyGuard ?? new LocalCopyGuard({ content: deps.deployedContent });
  }

  // A read, so the card can offer the retry without taking the write lock.
  async pending(target: DeployTarget): Promise<PendingOperation | null> {
    const record = await this.deps.selection
      .pending(await this.keyFor(target))
      .catch(() => null);
    return record === null ? null : summarise(record);
  }

  async execute(input: {
    target: DeployTarget;
    confirmedCopyReceipt?: string;
  }): Promise<RetryTargetOperationResult> {
    if (
      input.target.kind === "repo" &&
      !(await this.deps.registry.isRegistered(input.target.repoPath))
    ) {
      return { ok: false, error: "repo-not-registered" };
    }
    let key: string;
    try {
      key = await this.keyFor(input.target);
    } catch {
      return { ok: false, error: "retry-failed" };
    }
    const run = await this.deps.locks.run(key, () => this.retry(input, key));
    return run.ok ? run.value : { ok: false, error: "retry-in-progress" };
  }

  private async keyFor(target: DeployTarget): Promise<string> {
    return target.kind === "repo"
      ? await this.deps.canonicalPath(target.repoPath)
      : GLOBAL_LOCK_KEY;
  }

  private async retry(
    input: { target: DeployTarget; confirmedCopyReceipt?: string },
    key: string,
  ): Promise<RetryTargetOperationResult> {
    // Swallow rather than rethrow: a raw apm message may carry a token and must
    // never reach the transport layer (security.md).
    try {
      // Read under the lock, so a retry cannot start beside the operation it is
      // recovering from.
      const record = await this.deps.selection.pending(key);
      if (record === null) {
        return { ok: false, error: "nothing-to-retry" };
      }
      // The tools the interrupted run was given, never what this machine shows
      // now: the retry converges on the operation that was saved.
      const tools = record.tools ?? undefined;
      const scope = { write: record.kind, target: input.target } as const;
      const check = await this.copyGuard.check({
        ...scope,
        names: [...new Set([...record.previous, ...record.desired])],
        ...(tools === undefined ? {} : { tools }),
        release: record.release,
      });
      const admitted = this.copyGuard.admits(
        scope,
        check,
        input.confirmedCopyReceipt,
      );
      if (!admitted.ok) {
        return {
          ok: false,
          error: COPY_ERRORS[admitted.blocked],
          ...(admitted.receipt === null
            ? {}
            : { copyReceipt: admitted.receipt }),
        };
      }

      const applied = await this.deps.selection.apply({
        target: input.target,
        key,
        kind: record.kind,
        origin: originOf(record.harness),
        release: record.release,
        previous: record.previous,
        desired: record.desired,
        ...(tools === undefined ? {} : { tools }),
      });
      if (applied.ok) {
        return { ok: true, completed: summarise(record) };
      }
      return {
        ok: false,
        error:
          applied.error === "manifest-not-recognised"
            ? "manifest-not-recognised"
            : applied.error === "apply-incomplete"
              ? "retry-incomplete"
              : "retry-failed",
      };
    } catch {
      return { ok: false, error: "retry-failed" };
    }
  }
}

// ADR-0014: every origin Maestro deploys from is github.com, so the record
// keeps the owner/repo alone.
function originOf(harness: string) {
  return { host: "github.com", ownerRepo: harness };
}

function summarise(record: TargetOperation): PendingOperation {
  return {
    kind: record.kind,
    release: record.release,
    desired: record.desired,
  };
}
