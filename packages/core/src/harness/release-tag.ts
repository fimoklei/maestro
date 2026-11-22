import type { HarnessTag } from "./read-harness-state";

export const RELEASE_TAG_PATTERN =
  /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export const releaseTagsNewestFirst = (names: readonly string[]): string[] =>
  names
    .filter((name) => RELEASE_TAG_PATTERN.test(name))
    .sort((one, other) => other.localeCompare(one, "en", { numeric: true }));

export const highestReleaseTag = (tags: HarnessTag[]): HarnessTag | null => {
  const releases = tags.filter((tag) => RELEASE_TAG_PATTERN.test(tag.name));
  if (releases.length === 0) {
    return null;
  }
  return releases.reduce((highest, tag) =>
    tag.name.localeCompare(highest.name, "en", { numeric: true }) > 0
      ? tag
      : highest,
  );
};
