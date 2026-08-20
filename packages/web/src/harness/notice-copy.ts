import type {
  HarnessStateError,
  ImportNameBlocker,
  ImportSkillError,
  ImportSourceBlocker,
  PromoteDeletionError,
  PromoteSkillError,
  PublishReleaseError,
  ReleasePlanError,
} from "@maestro/core";
import type { NoticeContent } from "../ui/notice";
import { type NoticeTable, noticeFromTable } from "../ui/notice-table";

// The heading half of every Harness notice. The server sends one sentence per
// code (ADR-0018); web owns the short line above it, so a new code in core
// fails typecheck here until it has one.

// The state read's two refusals ride in every other table below: a plan, a
// release and a promotion all read the same harness first.
const harnessHeadings: NoticeTable<HarnessStateError> = {
  "not-configured": { level: "error", label: "no Harness is connected" },
  "no-usable-origin": {
    level: "error",
    label: "no GitHub origin",
  },
};

const releasePlanHeadings: NoticeTable<ReleasePlanError> = {
  ...harnessHeadings,
  "no-answer": { level: "error", label: "no answer from GitHub" },
};

const publishReleaseHeadings: NoticeTable<PublishReleaseError> = {
  ...harnessHeadings,
  "no-answer": { level: "error", label: "no answer from GitHub" },
  "already-released": { level: "error", label: "someone published first" },
  "plan-changed": { level: "error", label: "the plan is stale" },
  "publish-failed": { level: "error", label: "the tag was not pushed" },
  "publish-in-progress": {
    level: "error",
    label: "a release is already running",
  },
};

// One table over promotion and removal: a code both can refuse with is the
// same thing going wrong, so it reads the same on the row and in the dialog.
const promoteHeadings: NoticeTable<PromoteSkillError | PromoteDeletionError> = {
  ...harnessHeadings,
  "invalid-skill": { level: "error", label: "the name is not a slug" },
  "no-answer": { level: "error", label: "no answer from GitHub" },
  "skill-missing": { level: "error", label: "nothing left to promote" },
  "push-elsewhere": { level: "error", label: "the clone pushes elsewhere" },
  "source-changed": { level: "error", label: "the folder changed mid-read" },
  "concurrent-change": { level: "error", label: "a teammate changed it" },
  "promote-failed": { level: "error", label: "the push did not land" },
  "promote-in-progress": {
    level: "error",
    label: "a promotion is already running",
  },
  "confirmation-stale": {
    level: "error",
    label: "the confirmation is stale",
  },
  "not-deleted": { level: "error", label: "the skill is still there" },
  "sparse-checkout": {
    level: "error",
    label: "the clone is partial",
  },
  "merge-in-progress": { level: "error", label: "a merge is unfinished" },
  "rebase-in-progress": { level: "error", label: "a rebase is unfinished" },
  "unresolved-conflicts": {
    level: "error",
    label: "conflicts are unresolved",
  },
  unreadable: { level: "error", label: "the working tree is unreadable" },
};

// Covers the import mutation and the check that runs before it: both blocker
// unions are subsets of this one, so a picked folder and a refused copy name
// the same fault the same way.
const importHeadings: NoticeTable<ImportSkillError> = {
  "not-configured": harnessHeadings["not-configured"],
  "source-unreadable": {
    level: "error",
    label: "the folder cannot be read",
  },
  "outside-root": { level: "error", label: "folder out of reach" },
  "deployed-copy": { level: "error", label: "that is a deployed copy" },
  "missing-manifest": { level: "error", label: "no SKILL.md in it" },
  "invalid-frontmatter": {
    level: "error",
    label: "the frontmatter does not parse",
  },
  "empty-description": { level: "error", label: "the description is empty" },
  "invalid-name": { level: "error", label: "the name is not a slug" },
  "name-taken": { level: "error", label: "that name is taken" },
  "not-found": { level: "error", label: "the folder is gone" },
  "not-a-directory": { level: "error", label: "not a folder" },
  "destination-exists": { level: "error", label: "that name is taken" },
  "unsafe-link": { level: "error", label: "it holds a symbolic link" },
  "hard-linked-file": { level: "error", label: "a file is shared elsewhere" },
  "special-file": { level: "error", label: "it holds a special file" },
  "too-many-files": { level: "error", label: "over 1,000 files" },
  "too-large": { level: "error", label: "over 50 MiB" },
  "source-changed": { level: "error", label: "the folder changed mid-copy" },
  "copy-failed": { level: "error", label: "the copy did not finish" },
  "destination-unsafe": {
    level: "error",
    label: "the skills folder is outside",
  },
};

export const harnessStateNotice = (error: unknown): NoticeContent | null =>
  noticeFromTable(harnessHeadings, error, "the Harness did not load");

export const refreshNotice = (error: unknown): NoticeContent | null =>
  noticeFromTable(harnessHeadings, error, "GitHub was not read");

export const releasePlanNotice = (error: unknown): NoticeContent | null =>
  noticeFromTable(releasePlanHeadings, error, "no plan to show");

export const publishReleaseNotice = (error: unknown): NoticeContent | null =>
  noticeFromTable(publishReleaseHeadings, error, "release not published");

export const promoteNotice = (error: unknown): NoticeContent | null =>
  noticeFromTable(promoteHeadings, error, "the skill was not promoted");

export const removalNotice = (error: unknown): NoticeContent | null =>
  noticeFromTable(promoteHeadings, error, "removal not published");

export const importNotice = (error: unknown): NoticeContent | null =>
  noticeFromTable(importHeadings, error, "nothing imported");

// The check's refusals never travel as an HTTP failure — they come back in a
// successful reply, with the sentence written in `import-view-model`.
export const importBlockerNotice = (
  blocker: ImportSourceBlocker | ImportNameBlocker,
  message: string,
): NoticeContent => ({ ...importHeadings[blocker], message });
