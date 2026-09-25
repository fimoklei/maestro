import { parseGitOrigin } from "../deploy/git-origin";
import type { InFlightLocks } from "../deploy/in-flight-locks";
import {
  proposeReleaseVersion,
  type SemverStep,
} from "./propose-release-version";
import type {
  HarnessFreshnessPort,
  HarnessGitPort,
  ReleasePlan,
  ReleasePlanResult,
} from "./read-harness-state";
import { recordFetch } from "./record-fetch";
import { highestReleaseTag } from "./release-tag";
import { diffSkillTrees } from "./skill-movements";

export type PublishReleaseError =
  | "not-configured"
  | "no-usable-origin"
  | "no-answer"
  | "empty-delta"
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
    freshness: HarnessFreshnessPort;
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
    at: Date,
  ): Promise<PublishReleaseResult> {
    const root = await this.deps.resolveRoot();
    if (root === undefined) {
      return { ok: false, error: "not-configured" };
    }

    const run = await this.deps.locks.run(root, () =>
      this.publish(root, confirmation, at),
    );
    return run.ok ? run.value : { ok: false, error: "publish-in-progress" };
  }

  private async publish(
    root: string,
    confirmation: ReleaseConfirmation,
    at: Date,
  ): Promise<PublishReleaseResult> {
    const outcome = await recordFetch(this.deps, root, at);

    const facts = await this.deps.git.readFacts(root);
    const origin =
      facts.originUrl === null ? null : parseGitOrigin(facts.originUrl);
    if (origin === null) {
      return { ok: false, error: "no-usable-origin" };
    }

    const head = facts.defaultBranchCommit;
    const branch = facts.defaultBranch;
    if (
      outcome !== "fetched" ||
      head === null ||
      branch === null ||
      facts.tags === null
    ) {
      return { ok: false, error: "no-answer" };
    }

    const released = highestReleaseTag(facts.tags);
    // Versions depend on the previous tag alone (#520).
    const { versions } = proposeReleaseVersion(released?.name ?? null, []);
    const tag = versions[confirmation.step];

    // Every way the remote can have moved out from under the plan.
    const stale =
      (released?.name ?? null) !== confirmation.previousTag ||
      (released?.commit ?? null) !== confirmation.previousTagCommit ||
      head !== confirmation.revision ||
      facts.tags.some((existing) => existing.name === tag);
    if (stale) {
      return await this.refuse(root, "plan-changed", true);
    }

    // After the staleness check, so a stale plan reports `plan-changed` (#970).
    const previous =
      released === null
        ? []
        : await this.deps.git.readSkillTrees(root, released.commit);
    const current = await this.deps.git.readSkillTrees(root, head);
    if (previous === null || current === null) {
      return { ok: false, error: "no-answer" };
    }
    if (diffSkillTrees(previous, current).length === 0) {
      return await this.refuse(root, "empty-delta", true);
    }

    const push = await this.deps.git.publishTag(root, tag, head, branch);
    switch (push) {
      case "pushed":
        return { ok: true, tag, revision: head };
      case "already-exists":
        return await this.refuse(
          root,
          "already-released",
          await this.madeCurrent(root, at),
        );
      // The lease refused, so `--atomic` created nothing.
      case "stale-tip":
        return await this.refuse(
          root,
          "plan-changed",
          await this.madeCurrent(root, at),
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

  private async madeCurrent(root: string, at: Date): Promise<boolean> {
    return (await recordFetch(this.deps, root, at)) === "fetched";
  }
}
