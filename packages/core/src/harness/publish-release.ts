import type { InFlightLocks } from "../deploy/in-flight-locks";
import type { HarnessFetchGate } from "./harness-fetch-gate";
import {
  proposeReleaseVersion,
  type SemverStep,
} from "./propose-release-version";
import type {
  HarnessGitPort,
  ReleasePlan,
  ReleasePlanResult,
} from "./read-harness-state";
import { type ReleaseBlock, readReleaseReadiness } from "./release-readiness";

export type PublishReleaseError =
  | "not-configured"
  | "no-usable-origin"
  | "no-answer"
  | ReleaseBlock
  | "already-released"
  | "plan-changed"
  | "publish-failed"
  | "publish-in-progress";

// Compared against the freshly read remote, never used as the thing to tag (#520).
export type ReleaseConfirmation = {
  step: SemverStep;
  previousTag: string | null;
  previousTagCommit: string | null;
  revision: string;
};

// `recomputed` is absent unless the refs behind it are current (#521).
export type PublishReleaseResult =
  | { ok: true; tag: string; revision: string }
  | { ok: false; error: PublishReleaseError; recomputed?: ReleasePlan };

export class PublishRelease {
  private readonly deps: {
    resolveRoot: () => Promise<string | undefined>;
    git: HarnessGitPort;
    fetchGate: Pick<HarnessFetchGate, "fetchFresh" | "invalidate">;
    // Takes the locked root, never a re-resolved one (#521).
    replan: (root: string) => Promise<ReleasePlanResult>;
    locks: InFlightLocks;
  };

  constructor(deps: PublishRelease["deps"]) {
    this.deps = deps;
  }

  // One lock per harness: two confirmations never race for one version (#520).
  async execute(
    confirmation: ReleaseConfirmation,
  ): Promise<PublishReleaseResult> {
    const root = await this.deps.resolveRoot();
    if (root === undefined) {
      return { ok: false, error: "not-configured" };
    }

    const run = await this.deps.locks.run(root, () =>
      this.publish(root, confirmation),
    );
    return run.ok ? run.value : { ok: false, error: "publish-in-progress" };
  }

  private async publish(
    root: string,
    confirmation: ReleaseConfirmation,
  ): Promise<PublishReleaseResult> {
    const outcome = await this.deps.fetchGate.fetchFresh(root);

    const read = await readReleaseReadiness(
      this.deps.git,
      root,
      outcome === "fetched",
    );
    if (!read.ok) {
      return read;
    }
    const { released, tags, head, defaultBranch, content } = read.readiness;
    // Versions depend on the previous tag alone (#520).
    const { versions } = proposeReleaseVersion(released?.name ?? null, []);
    const tag = versions[confirmation.step];

    // Every way the remote can have moved out from under the plan.
    const stale =
      (released?.name ?? null) !== confirmation.previousTag ||
      (released?.commit ?? null) !== confirmation.previousTagCommit ||
      head !== confirmation.revision ||
      tags.some((existing) => existing.name === tag);
    if (stale) {
      return await this.refuse(root, "plan-changed", true);
    }

    // Decided after the staleness check, so a stale plan reports `plan-changed` (#970).
    if (content === null) {
      return { ok: false, error: "no-answer" };
    }
    if (content.blocked !== null) {
      return await this.refuse(root, content.blocked, true);
    }

    const push = await this.deps.git.publishTag(root, tag, head, defaultBranch);
    switch (push) {
      case "pushed":
        // The new tag reaches the clone only through a fetch.
        this.deps.fetchGate.invalidate(root);
        return { ok: true, tag, revision: head };
      case "already-exists":
        return await this.refuse(
          root,
          "already-released",
          await this.madeCurrent(root),
        );
      // The lease refused, so `--atomic` created nothing.
      case "stale-tip":
        return await this.refuse(
          root,
          "plan-changed",
          await this.madeCurrent(root),
        );
      case "offline":
        return { ok: false, error: "no-answer" };
      case "push-failed":
        return { ok: false, error: "publish-failed" };
    }
  }

  // Replans only from refs known current: `planRelease` cannot see a stale mirror.
  private async refuse(
    root: string,
    error: PublishReleaseError,
    refsAreCurrent: boolean,
  ): Promise<PublishReleaseResult> {
    const replanned = refsAreCurrent ? await this.deps.replan(root) : null;
    return replanned?.ok
      ? { ok: false, error, recomputed: replanned.plan }
      : { ok: false, error };
  }

  private async madeCurrent(root: string): Promise<boolean> {
    return (await this.deps.fetchGate.fetchFresh(root)) === "fetched";
  }
}
