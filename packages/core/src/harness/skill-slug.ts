import { MAX_SLUG_LENGTH } from "../deploy/package-ref";

export const proposeSkillSlug = (folderName: string): string =>
  folderName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, MAX_SLUG_LENGTH)
    // After the cut too: a name trimmed mid-word must not end on a hyphen.
    .replace(/^-+|-+$/g, "");
