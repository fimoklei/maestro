import type { ToolPresencePort } from "../tools/tool-presence-port";
import type { SelectionWriter } from "./apply-selection";
import type {
  DeployedCleanupPort,
  DeployedContentPort,
  DeployTarget,
} from "./deploy-skill";
import { discardDroppedCopies } from "./discard-dropped-copies";
import { GLOBAL_LOCK_KEY, type InFlightLocks } from "./in-flight-locks";
import { type CopyVerdict, LocalCopyGuard } from "./local-copy-guard";
import type { PlaceReader } from "./place-reading";
import type { TargetOperation, TargetOperationKind } from "./target-operation";
import {
  reportWrite,
  type WriteReport,
  writtenEverywhere,
} from "./write-report";

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
  | "retry-incomplete"
  | "retry-timed-out"
  | "retry-failed";

export type RetryTargetOperationResult =
  | {
      ok: true;
      completed: PendingOperation;
      report?: WriteReport;
      landed: readonly string[];
    }
  | {
      ok: false;
      error: RetryTargetOperationError;
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
    deployedCleanup: DeployedCleanupPort;
    copyGuard?: Pick<LocalCopyGuard, "check" | "admits">;
    deployedContent: Pick<
      DeployedContentPort,
      "readLockfile" | "classify" | "contentDigest" | "linkedSkillPath"
    >;
    toolPresence: ToolPresencePort;
    canonicalPath: (path: string) => Promise<string>;
    locks: InFlightLocks;
    outcomes: Pick<PlaceReader, "read">;
  };

  private readonly copyGuard: Pick<LocalCopyGuard, "check" | "admits">;

  constructor(deps: RetryTargetOperation["deps"]) {
    this.deps = deps;
    this.copyGuard =
      deps.copyGuard ?? new LocalCopyGuard({ content: deps.deployedContent });
  }

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
    const run = await this.deps.locks.run(key, () =>
      this.retryUnderLock(input, key),
    );
    return run.ok ? run.value : { ok: false, error: "retry-in-progress" };
  }

  private async keyFor(target: DeployTarget): Promise<string> {
    return target.kind === "repo"
      ? await this.deps.canonicalPath(target.repoPath)
      : GLOBAL_LOCK_KEY;
  }

  private async retryUnderLock(
    input: { target: DeployTarget; confirmedCopyReceipt?: string },
    key: string,
  ): Promise<RetryTargetOperationResult> {
    try {
      const record = await this.deps.selection.pending(key);
      if (record === null) {
        return { ok: false, error: "nothing-to-retry" };
      }
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

      if (record.kind === "update") {
        await discardDroppedCopies(this.deps.deployedCleanup, {
          target: input.target,
          previous: record.previous,
          desired: record.desired,
          tools: record.tools ?? [],
        });
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
        const readings = await this.deps.outcomes
          .read({
            target: input.target,
            release: record.release,
            names: record.desired,
            tools: tools ?? [],
          })
          .catch(() => null);
        const report =
          readings === null
            ? undefined
            : reportWrite({
                readings,
                names: record.desired,
                wrote: new Set(record.desired),
                refused: new Map(),
              });
        return {
          ok: true,
          completed: summarise(record),
          ...(report === undefined ? {} : { report }),
          landed:
            report === undefined
              ? []
              : record.desired.filter((name) =>
                  writtenEverywhere(report, name),
                ),
        };
      }
      return {
        ok: false,
        error:
          applied.error === "manifest-not-recognised"
            ? "manifest-not-recognised"
            : applied.error === "apply-incomplete"
              ? "retry-incomplete"
              : applied.error === "apply-timed-out"
                ? "retry-timed-out"
                : "retry-failed",
      };
    } catch {
      return { ok: false, error: "retry-failed" };
    }
  }
}

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
