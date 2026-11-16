// The Harness categories in the latest release, read through the one file reader.
import type { HarnessGitPort, HarnessTag } from "../harness/read-harness-state";
import { highestReleaseTag } from "../harness/release-tag";
import type { CategoryRecord } from "./category-section";
import {
  HARNESS_CATEGORIES_MAX_BYTES,
  HARNESS_CATEGORIES_PATH,
  readHarnessCategoriesFile,
} from "./harness-categories-file";

export type ReleasedCategoriesGitPort = Pick<HarnessGitPort, "readFileAt"> & {
  readTags(root: string): Promise<HarnessTag[] | null>;
};

/** `none`: no release, no file, or no valid category. `unread`: git could not answer. */
export type ReleasedHarnessCategories =
  | { kind: "none" }
  | { kind: "unread" }
  | { kind: "faulty"; tag: string }
  | { kind: "listed"; tag: string; record: CategoryRecord; skipped: number };

export const readReleasedHarnessCategories = async (
  git: ReleasedCategoriesGitPort,
  root: string,
): Promise<ReleasedHarnessCategories> => {
  const tags = await git.readTags(root);
  if (tags === null) return { kind: "unread" };
  const tag = highestReleaseTag(tags);
  if (tag === null) return { kind: "none" };
  const read = await git.readFileAt(
    root,
    tag.commit,
    HARNESS_CATEGORIES_PATH,
    HARNESS_CATEGORIES_MAX_BYTES,
  );
  if (read === null) return { kind: "unread" };
  const file = readHarnessCategoriesFile(read);
  if (file.kind === "faulty") return { kind: "faulty", tag: tag.name };
  if (file.kind === "absent" || file.record.names.length === 0) {
    return { kind: "none" };
  }
  return {
    kind: "listed",
    tag: tag.name,
    record: file.record,
    skipped: file.skipped,
  };
};
