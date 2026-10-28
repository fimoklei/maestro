// The one read of the latest release. The Harness read, the release plan and
// the withdrawal all take it from here, so they never disagree on which
// release is the latest.
import type {
  HarnessFacts,
  HarnessFreshness,
  HarnessFreshnessPort,
  HarnessGitPort,
  HarnessTag,
} from "./read-harness-state";
import { highestReleaseTag } from "./release-tag";

// `known: false` is a tag list nobody can trust yet, never "no release
// exists"; `tag: null` is a harness that was never released.
export type LatestRelease =
  | { known: false }
  | { known: true; tags: HarnessTag[]; tag: HarnessTag | null };

// `refsConfirmed`: the tags come from a fetch that reached the remote (#519).
export const latestReleaseOf = (
  tags: HarnessTag[] | null,
  refsConfirmed: boolean,
): LatestRelease =>
  !refsConfirmed || tags === null
    ? { known: false }
    : { known: true, tags, tag: highestReleaseTag(tags) };

export const readLatestRelease = async (
  git: Pick<HarnessGitPort, "readFacts">,
  freshnessPort: Pick<HarnessFreshnessPort, "read">,
  root: string,
): Promise<{
  facts: HarnessFacts;
  freshness: HarnessFreshness;
  latest: LatestRelease;
}> => {
  const facts = await git.readFacts(root);
  const freshness = await freshnessPort.read(root);
  return {
    facts,
    freshness,
    latest: latestReleaseOf(facts.tags, freshness.lastFetchedAt !== null),
  };
};
