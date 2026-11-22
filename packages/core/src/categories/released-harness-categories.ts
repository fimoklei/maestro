import type { HarnessGitPort, HarnessTag } from "../harness/read-harness-state";
import { highestReleaseTag } from "../harness/release-tag";
import { HARNESS_CATEGORIES_FILE } from "../inventory/harness-layout";
import type { CategoryRecord } from "./category-section";
import {
  HARNESS_CATEGORIES_MAX_BYTES,
  type HarnessCategoriesFile,
  readHarnessCategoriesFile,
} from "./harness-categories-file";

export type ReleasedCategoriesGitPort = Pick<HarnessGitPort, "readFileAt"> & {
  readTags(root: string): Promise<HarnessTag[] | null>;
};

export type ReleasedHarnessCategories =
  | { kind: "none" }
  | { kind: "unread" }
  | { kind: "faulty"; tag: string }
  | { kind: "listed"; tag: string; record: CategoryRecord; skipped: number };

export const readHarnessCategoriesAt = async (
  git: Pick<HarnessGitPort, "readFileAt">,
  root: string,
  ref: string,
): Promise<HarnessCategoriesFile | null> => {
  const read = await git.readFileAt(
    root,
    ref,
    HARNESS_CATEGORIES_FILE,
    HARNESS_CATEGORIES_MAX_BYTES,
  );
  return read === null ? null : readHarnessCategoriesFile(read);
};

export const readReleasedHarnessCategories = async (
  git: ReleasedCategoriesGitPort,
  root: string,
): Promise<ReleasedHarnessCategories> => {
  const tags = await git.readTags(root);
  if (tags === null) return { kind: "unread" };
  const tag = highestReleaseTag(tags);
  if (tag === null) return { kind: "none" };
  const file = await readHarnessCategoriesAt(git, root, tag.commit);
  if (file === null) return { kind: "unread" };
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
