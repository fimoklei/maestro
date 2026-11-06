import {
  RELEASE_TAG_PATTERN,
  releaseTagsNewestFirst,
} from "../harness/release-tag";
import type { LockfileReading } from "../lockfile/lockfile";
import type { DeployTarget } from "./deploy-skill";
import type { SupportedTool } from "./deploy-tools";

/**
 * One skill's copy in one Global folder, measured against the Target release.
 * `at-release` also covers a copy whose changes the latest release holds
 * (#1213). `not-updated`: unedited, but not the Target release; `stillAt` is
 * the newest older release it equals, or null where none matches.
 */
export type CopyReading =
  | { kind: "missing" }
  | { kind: "at-release" }
  | { kind: "not-updated"; stillAt: string | null }
  | { kind: "local-edits" }
  | { kind: "unverified" }
  | { kind: "unreadable" };

/** What a write left: the copy against the release alone, never its lockfile record. */
export type WrittenReading = Extract<
  CopyReading,
  { kind: "missing" | "at-release" | "not-updated" | "unreadable" }
>;

type CopyReadingSession = {
  read(name: string, tool: SupportedTool): Promise<CopyReading>;
  readWritten(name: string, tool: SupportedTool): Promise<WrittenReading>;
};

export type CopyReadingPort = {
  /**
   * One session per read: each (tag, skill) release tree is read at most once
   * in it. `tags`: the release tags, newest first; empty where unknown.
   */
  openReading(input: {
    target: DeployTarget;
    release: string | undefined;
    tags: readonly string[];
    lockfile: LockfileReading;
  }): CopyReadingSession;
};

// Numeric collation: v0.10.0 is newer than v0.9.0.
const newer = (tag: string, than: string) =>
  tag.localeCompare(than, "en", { numeric: true }) > 0;

/**
 * The releases older than `release`, newest first, and the latest release
 * where it differs from `release`.
 */
export function releasesAround(
  release: string | undefined,
  tags: readonly string[],
): { older: string[]; latest: string | undefined } {
  const releases = releaseTagsNewestFirst(tags);
  const latest = releases[0];
  const isRelease = release !== undefined && RELEASE_TAG_PATTERN.test(release);
  return {
    older: isRelease ? releases.filter((tag) => newer(release, tag)) : [],
    latest:
      latest === undefined ||
      latest === release ||
      (isRelease && !newer(latest, release))
        ? undefined
        : latest,
  };
}
