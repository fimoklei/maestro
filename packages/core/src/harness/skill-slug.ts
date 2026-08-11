import { MAX_SLUG_LENGTH } from "../deploy/package-ref";

// The directory name Maestro proposes for an imported skill folder. Identity is
// the directory name, so the proposal must already satisfy the deploy slug rule
// or the author has to fix it before importing (#576).

// Anything outside [a-z0-9] separates: a run of them becomes one hyphen, and
// leading and trailing hyphens are dropped. Empty where nothing survives.
export const proposeSkillSlug = (folderName: string): string =>
  folderName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, MAX_SLUG_LENGTH)
    // After the cut too: a name trimmed mid-word must not end on a hyphen.
    .replace(/^-+|-+$/g, "");
