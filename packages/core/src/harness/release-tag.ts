import type { HarnessTag } from "./read-harness-state";

// No leading zeros: `v01.2.3` is not semver (semver.org §2).
export const RELEASE_TAG_PATTERN =
  /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export const highestReleaseTag = (tags: HarnessTag[]): HarnessTag | null => {
  const releases = tags.filter((tag) => RELEASE_TAG_PATTERN.test(tag.name));
  if (releases.length === 0) {
    return null;
  }
  // Numeric collation: v0.10.0 beats v0.9.0.
  return releases.reduce((highest, tag) =>
    tag.name.localeCompare(highest.name, "en", { numeric: true }) > 0
      ? tag
      : highest,
  );
};
