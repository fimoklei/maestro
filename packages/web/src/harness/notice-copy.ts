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

// Every Harness notice, heading and sentence together (ADR-0025). The server
// sends the code and the status alone, so a new code in core fails typecheck
// here until it has a row.

// The state read's two refusals ride in every other table below: a plan, a
// release and a promotion all read the same harness first.
const harnessHeadings: NoticeTable<HarnessStateError> = {
  "not-configured": {
    level: "error",
    label: "no Harness is connected",
    message:
      "Nothing can be shown here until Maestro knows where the Harness lives. Set the Harness source path.",
  },
  "no-usable-origin": {
    level: "error",
    label: "no GitHub origin",
    message:
      "Releases are published as tags, so the clone must fetch from GitHub over https or ssh. Point its origin at the Harness repository.",
  },
};

const releasePlanHeadings: NoticeTable<ReleasePlanError> = {
  ...harnessHeadings,
  "no-answer": {
    level: "error",
    label: "no answer from GitHub",
    message:
      "A release plan is measured against what GitHub holds, and Maestro has not read that yet. Press refresh, then open the release again.",
  },
};

const publishReleaseHeadings: NoticeTable<PublishReleaseError> = {
  ...harnessHeadings,
  "no-answer": {
    level: "error",
    label: "no answer from GitHub",
    message:
      "Nothing was published. Press refresh to read GitHub again, then confirm the release.",
  },
  "already-released": {
    level: "error",
    label: "someone published first",
    message:
      "That version number is taken. Maestro recomputed the plan against the newest tag — check it, then confirm.",
  },
  "plan-changed": {
    level: "error",
    label: "the plan is stale",
    message:
      "GitHub moved while this dialog was open, so nothing was published. Maestro recomputed the plan — check it, then confirm.",
  },
  "publish-failed": {
    level: "error",
    label: "the tag was not pushed",
    message:
      "The Harness is as it was. Check the connection to GitHub, then confirm the release again.",
  },
  "publish-in-progress": {
    level: "error",
    label: "a release is already running",
    message:
      "Only one release runs at a time. Wait for it to finish, then read the plan again.",
  },
};

// Promotion and removal share a heading wherever they share a code — the same
// thing goes wrong — but each states its own way through, so the sentences
// differ where the server's two tables differed (#686).
const promoteHeadings: NoticeTable<PromoteSkillError> = {
  ...harnessHeadings,
  "invalid-skill": {
    level: "error",
    label: "the name is not a slug",
    message:
      "A skill name is lowercase letters, digits and single hyphens, like code-review.",
  },
  "no-answer": {
    level: "error",
    label: "no answer from GitHub",
    message:
      "Nothing was pushed. Press refresh to read GitHub again, then promote.",
  },
  "skill-missing": {
    level: "error",
    label: "nothing left to promote",
    message:
      "The skill is no longer in the Harness working tree, so nothing was pushed. Press refresh to repaint the list.",
  },
  "push-elsewhere": {
    level: "error",
    label: "the clone pushes elsewhere",
    message:
      "Maestro publishes only to the origin it fetches from, so nothing was pushed. Point the clone's push remote at that origin.",
  },
  "source-changed": {
    level: "error",
    label: "the folder changed mid-read",
    message:
      "Nothing was pushed. Let the edit on disk finish, then promote again.",
  },
  "concurrent-change": {
    level: "error",
    label: "a teammate changed it",
    message:
      "Nothing was pushed, so their version still stands. Pull it into the Harness clone, then promote again.",
  },
  "promote-failed": {
    level: "error",
    label: "the push did not land",
    message:
      "The Harness is as it was. Check the connection to GitHub, then promote again.",
  },
  "promote-in-progress": {
    level: "error",
    label: "a promotion is already running",
    message:
      "Only one promotion runs at a time. Wait for it to finish, then press promote.",
  },
};

const deletionHeadings: NoticeTable<PromoteDeletionError> = {
  ...harnessHeadings,
  "invalid-skill": promoteHeadings["invalid-skill"],
  "push-elsewhere": promoteHeadings["push-elsewhere"],
  "promote-in-progress": promoteHeadings["promote-in-progress"],
  "no-answer": {
    ...promoteHeadings["no-answer"],
    message:
      "Nothing was pushed. Press refresh to read GitHub again, then confirm the removal.",
  },
  "source-changed": {
    ...promoteHeadings["source-changed"],
    message:
      "Nothing was pushed. Press refresh to repaint the list, then decide again.",
  },
  "promote-failed": {
    ...promoteHeadings["promote-failed"],
    message:
      "The Harness is as it was. Check the connection to GitHub, then confirm again.",
  },
  "confirmation-stale": {
    level: "error",
    label: "the confirmation is stale",
    message:
      "The copy on the default branch moved after this confirmation was given, so nothing was pushed. Press refresh, then confirm again.",
  },
  "not-deleted": {
    level: "error",
    label: "the skill is still there",
    message:
      "A removal publishes what the Harness working tree already says. Delete the skill folder there first.",
  },
  "sparse-checkout": {
    level: "error",
    label: "the clone is partial",
    message:
      "A missing folder in a partial clone is not proof of a deletion, so nothing was pushed. Maestro cannot publish a removal from this clone — connect a complete one to remove skills.",
  },
  "merge-in-progress": {
    level: "error",
    label: "a merge is unfinished",
    message:
      "Nothing was pushed — a half-merged working tree does not state what should go. Finish or abort the merge, then confirm again.",
  },
  "rebase-in-progress": {
    level: "error",
    label: "a rebase is unfinished",
    message:
      "Nothing was pushed — a half-rebased working tree does not state what should go. Finish or abort the rebase, then confirm again.",
  },
  "unresolved-conflicts": {
    level: "error",
    label: "conflicts are unresolved",
    message:
      "Nothing was pushed — a conflicted working tree does not state what should go. Resolve the conflicts, then confirm again.",
  },
  unreadable: {
    level: "error",
    label: "the working tree is unreadable",
    message:
      "Nothing was pushed. Check that the Harness folder is still on disk and readable, then confirm again.",
  },
};

// Covers the import mutation and the check that runs before it: both blocker
// unions are subsets of this one, so a picked folder and a refused copy name
// the same fault the same way.
const importHeadings: NoticeTable<ImportSkillError> = {
  "not-configured": {
    ...harnessHeadings["not-configured"],
    message:
      "Nothing can be imported until Maestro knows where the Harness lives. Set the Harness source path, then import again.",
  },
  "source-unreadable": {
    level: "error",
    label: "the folder cannot be read",
    message:
      "Nothing was copied. Check that the folder is still on disk and readable, then pick it again.",
  },
  "outside-root": {
    level: "error",
    label: "folder out of reach",
    message:
      "Maestro reads inside the home folder only. Pick a folder under it.",
  },
  "deployed-copy": {
    level: "error",
    label: "that is a deployed copy",
    message:
      "Importing it would copy Maestro's own output back into the Harness. Pick the folder the skill is authored in.",
  },
  "missing-manifest": {
    level: "error",
    label: "no SKILL.md in it",
    message:
      "Without one, the folder is not a skill Maestro can carry. Pick the folder that holds the skill's SKILL.md.",
  },
  "invalid-frontmatter": {
    level: "error",
    label: "the frontmatter does not parse",
    message:
      "Maestro cannot read the skill's name or description. Fix the SKILL.md frontmatter, then import again.",
  },
  "empty-description": {
    level: "error",
    label: "the description is empty",
    message:
      "The description is what tells an agent when to reach for the skill. Fill it in in SKILL.md, then import again.",
  },
  "invalid-name": {
    level: "error",
    label: "the name is not a slug",
    message:
      "A skill name is lowercase letters, digits and single hyphens, like code-review.",
  },
  "name-taken": {
    level: "error",
    label: "that name is taken",
    message: "The Harness already holds a skill under it. Pick another name.",
  },
  "not-found": {
    level: "error",
    label: "the folder is gone",
    message: "Nothing was copied. Pick the folder again.",
  },
  "not-a-directory": {
    level: "error",
    label: "not a folder",
    message: "A skill is a folder with a SKILL.md in it. Pick one of those.",
  },
  "destination-exists": {
    level: "error",
    label: "that name is taken",
    message: "The Harness already holds a folder under it. Pick another name.",
  },
  "unsafe-link": {
    level: "error",
    label: "it holds a symbolic link",
    message:
      "Maestro will not follow one into somewhere else on disk, so nothing was copied. Replace the link with a real file, then import again.",
  },
  "hard-linked-file": {
    level: "error",
    label: "a file is shared elsewhere",
    message:
      "Copying it would tie the Harness to a file it does not own, so nothing was copied. Replace it with a plain copy, then import again.",
  },
  "special-file": {
    level: "error",
    label: "it holds a special file",
    message:
      "Maestro carries plain files and folders only, so nothing was copied. Take it out of the folder, then import again.",
  },
  "too-many-files": {
    level: "error",
    label: "over 1,000 files",
    message:
      "Nothing was copied. A skill is a handful of files — pick the skill folder itself, not the repository around it.",
  },
  "too-large": {
    level: "error",
    label: "over 50 MiB",
    message:
      "Nothing was copied. A skill is text — pick the skill folder itself, not the repository around it.",
  },
  "source-changed": {
    level: "error",
    label: "the folder changed mid-copy",
    message:
      "Nothing was left in the Harness. Let the edit on disk finish, then import again.",
  },
  "copy-failed": {
    level: "error",
    label: "the copy did not finish",
    message:
      "Nothing was left in the Harness. Check that there is room on disk, then import again.",
  },
  "destination-unsafe": {
    level: "error",
    label: "the skills folder is outside",
    message:
      "Writing there would land outside the Harness, so nothing was copied. Check that the Harness clone's skills folder is a real folder inside it.",
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
  noticeFromTable(deletionHeadings, error, "removal not published");

export const importNotice = (error: unknown): NoticeContent | null =>
  noticeFromTable(importHeadings, error, "nothing imported");

// The check's refusals never travel as an HTTP failure — they come back in a
// successful reply, with the sentence written in `import-view-model`.
export const importBlockerNotice = (
  blocker: ImportSourceBlocker | ImportNameBlocker,
  message: string,
): NoticeContent => ({ ...importHeadings[blocker], message });
