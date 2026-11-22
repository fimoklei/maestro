import {
  RELEASE_TAG_PATTERN,
  releaseTagsNewestFirst,
} from "../harness/release-tag";
import type { LockfileReading } from "../lockfile/lockfile";
import type { DeployTarget } from "./deploy-skill";
import type { SupportedTool } from "./deploy-tools";

export type CopyReading =
  | { kind: "missing" }
  | { kind: "at-release" }
  | { kind: "not-updated"; stillAt: string | null; targetRelease: string }
  | { kind: "local-edits" }
  | { kind: "edits-in-harness" }
  | { kind: "unverified" }
  | { kind: "unreadable" };

export type WrittenReading = Extract<
  CopyReading,
  { kind: "missing" | "at-release" | "not-updated" | "unreadable" }
>;

type CopyReadingSession = {
  read(name: string, tool: SupportedTool): Promise<CopyReading>;
  readWritten(name: string, tool: SupportedTool): Promise<WrittenReading>;
};

export async function readEach<R>(
  names: Iterable<string>,
  read: (name: string) => Promise<R>,
): Promise<Map<string, R | null>> {
  const readings = new Map<string, R | null>();
  for (const name of names) {
    readings.set(name, await read(name).catch(() => null));
  }
  return readings;
}

export type CopyReadingPort = {
  openReading(input: {
    target: DeployTarget;
    release: string | undefined;
    tags: readonly string[];
    lockfile: LockfileReading;
  }): CopyReadingSession;
  harnessHolds(input: {
    target: DeployTarget;
    name: string;
    lockfile: LockfileReading;
  }): Promise<boolean>;
};

const newer = (tag: string, than: string) =>
  tag.localeCompare(than, "en", { numeric: true }) > 0;

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
