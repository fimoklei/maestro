import { parseGitOrigin } from "../deploy/git-origin";
import type { InFlightLocks } from "../deploy/in-flight-locks";
import {
  proposeReleaseVersion,
  type SemverStep,
} from "./propose-release-version";
import type {
  HarnessFreshnessPort,
  HarnessGitPort,
} from "./read-harness-state";
import { highestReleaseTag } from "./release-tag";

export type PublishReleaseError =
  | "not-configured"
  | "no-usable-origin"
  | "no-answer"
  | "already-released"
  | "plan-changed"
  | "publish-failed"
  | "publish-in-progress";

export type PublishReleaseResult =
  | { ok: true; tag: string; revision: string }
  | { ok: false; error: PublishReleaseError };

export class PublishRelease {
  private readonly deps: {
    resolveRoot: () => Promise<string | undefined>;
    git: HarnessGitPort;
    freshness: HarnessFreshnessPort;
    locks: InFlightLocks;
  };

  constructor(deps: PublishRelease["deps"]) {
    this.deps = deps;
  }

  // `previousTag` is what the author's dialog last showed them — the seam a
  // concurrent teammate's release or a retried confirmation of this very
  // request would break. One lock per harness turns two overlapping
  // confirmations into one that runs and one that is told to wait, rather
  // than two pushes racing for the same version (#520).
  async execute(
    step: SemverStep,
    previousTag: string | null,
    at: Date,
  ): Promise<PublishReleaseResult> {
    const root = await this.deps.resolveRoot();
    if (root === undefined) {
      return { ok: false, error: "not-configured" };
    }

    const run = await this.deps.locks.run(root, () =>
      this.publish(root, step, previousTag, at),
    );
    return run.ok ? run.value : { ok: false, error: "publish-in-progress" };
  }

  private async publish(
    root: string,
    step: SemverStep,
    previousTag: string | null,
    at: Date,
  ): Promise<PublishReleaseResult> {
    const outcome = await this.deps.git.fetch(root);
    const previous = await this.deps.freshness.read(root);
    await this.deps.freshness.record(root, {
      outcome,
      lastFetchedAt:
        outcome === "fetched" ? at.toISOString() : previous.lastFetchedAt,
    });

    const facts = await this.deps.git.readFacts(root);
    const origin =
      facts.originUrl === null ? null : parseGitOrigin(facts.originUrl);
    if (origin === null) {
      return { ok: false, error: "no-usable-origin" };
    }

    const head = facts.defaultBranchCommit;
    if (outcome !== "fetched" || head === null || facts.tags === null) {
      return { ok: false, error: "no-answer" };
    }

    const released = highestReleaseTag(facts.tags);
    // The remote has moved past what the plan priced this against — someone
    // else released, or an earlier attempt at this same confirmation already
    // did. Publishing the step blindly would bump a version that no longer
    // exists (#520).
    if ((released?.name ?? null) !== previousTag) {
      return { ok: false, error: "plan-changed" };
    }

    // The delta never travels here: every step's version is a pure function
    // of the previous tag, so the empty movements list changes nothing this
    // reads (#520).
    const { versions } = proposeReleaseVersion(released?.name ?? null, []);
    const tag = versions[step];

    const push = await this.deps.git.publishTag(root, tag, head);
    switch (push) {
      case "pushed":
        return { ok: true, tag, revision: head };
      case "already-exists":
        return { ok: false, error: "already-released" };
      case "offline":
        return { ok: false, error: "no-answer" };
      case "push-failed":
        return { ok: false, error: "publish-failed" };
    }
  }
}
