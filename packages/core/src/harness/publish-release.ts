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

export type PublishReleaseError =
  | "not-configured"
  | "no-usable-origin"
  | "no-answer"
  | "already-released"
  | "plan-changed"
  | "publish-failed"
  | "publish-in-progress";

// What the author's dialog last showed them. Every field is compared against
// the freshly read remote, never used as the thing to tag (#520).
export type ReleaseConfirmation = {
  step: SemverStep;
  previousTag: string | null;
  previousTagCommit: string | null;
  revision: string;
};

// `recomputed` turns a refused plan into the next one to confirm rather than a
// dead end. Absent unless the refs behind it are current (#521).
export type PublishReleaseResult =
  | { ok: true; tag: string; revision: string }
  | { ok: false; error: PublishReleaseError; recomputed?: ReleasePlan };

export class PublishRelease {
  private readonly deps: {
    resolveRoot: () => Promise<string | undefined>;
    git: HarnessGitPort;
    freshness: HarnessFreshnessPort;
    // Takes the root this publication already resolved and locked, so a
    // harness connected mid-flight can never answer for the one being
    // published (#521).
    replan: (root: string) => Promise<ReleasePlanResult>;
    locks: InFlightLocks;
  };

  constructor(deps: PublishRelease["deps"]) {
    this.deps = deps;
  }

  // The confirmation carries the plan the author saw, so a remote that moved
  // under it can be told from one that did not. One lock per harness, so two
  // overlapping confirmations never race for the same version (#520).
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
    // Records what this fetch found, so the freshness the screen shows is this
    // confirmation's own reach at the remote and never the plan's.
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
    // The delta never travels here: every step's version is a pure function
    // of the previous tag, so the empty movements list changes nothing this
    // reads (#520).
    const { versions } = proposeReleaseVersion(released?.name ?? null, []);
    const tag = versions[confirmation.step];

    // Every way the remote can have moved out from under the plan: a higher
    // tag appeared, the previous one was force-moved, the tip advanced, or the
    // version is taken. Each publishes something the dialog never priced.
    const stale =
      (released?.name ?? null) !== confirmation.previousTag ||
      (released?.commit ?? null) !== confirmation.previousTagCommit ||
      head !== confirmation.revision ||
      facts.tags.some((existing) => existing.name === tag);
    if (stale) {
      // The mismatch was found in refs this call just fetched, so they already
      // carry the plan that replaces this one.
      return await this.refuse(root, "plan-changed", true);
    }

    const push = await this.deps.git.publishTag(root, tag, head, branch);
    switch (push) {
      case "pushed":
        return { ok: true, tag, revision: head };
      // The name was taken between this read and this push: nothing was
      // overwritten, and nothing about it is terminal.
      case "already-exists":
        return await this.refuse(
          root,
          "already-released",
          await this.madeCurrent(root, at),
        );
      // The lease refused, so `--atomic` created nothing. Same answer as a
      // plan the remote has moved past: read again and decide again.
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

  // A refused plan is answered with the plan that replaces it — but only from
  // refs known to be current. `planRelease` reads local refs and asks only
  // that something was once fetched, so it cannot notice a stale mirror.
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

  // A push the remote refused proves the local refs are behind it, so they are
  // fetched again. False where that fetch found nothing to be current from.
  private async madeCurrent(root: string, at: Date): Promise<boolean> {
    return (await recordFetch(this.deps, root, at)) === "fetched";
  }
}
