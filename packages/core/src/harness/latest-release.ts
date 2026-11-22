import type {
  HarnessFacts,
  HarnessFreshness,
  HarnessFreshnessPort,
  HarnessGitPort,
  HarnessTag,
} from "./read-harness-state";
import { highestReleaseTag } from "./release-tag";

export type LatestRelease =
  | { known: false }
  | { known: true; tags: HarnessTag[]; tag: HarnessTag | null };

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
