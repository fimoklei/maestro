// The previous release is the highest `vX.Y.Z` tag wherever it points: tags are
// neither attributed nor filtered by reachability, so a repository shared with
// another product is neither refused nor specially handled (ADR-0021).
import type { HarnessTag } from "./read-harness-state";

// No leading zeros: `v01.2.3` is not a semantic version (semver.org §2), and
// reading it as one would bump from a number nobody published. One pattern for
// both the highest-tag search and the proposal, so the two cannot disagree.
export const RELEASE_TAG_PATTERN =
  /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export const highestReleaseTag = (tags: HarnessTag[]): HarnessTag | null => {
  const releases = tags.filter((tag) => RELEASE_TAG_PATTERN.test(tag.name));
  if (releases.length === 0) {
    return null;
  }
  // Numeric collation reads each digit run as a number, so v0.10.0 beats
  // v0.9.0 where a plain string compare would not.
  return releases.reduce((highest, tag) =>
    tag.name.localeCompare(highest.name, "en", { numeric: true }) > 0
      ? tag
      : highest,
  );
};
