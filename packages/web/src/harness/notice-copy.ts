import type {
  HarnessFreshness,
  HarnessStateError,
  ImportNameBlocker,
  ImportSkillError,
  ImportSourceBlocker,
  PromoteDeletionError,
  PromoteSkillError,
  ProposalActionError,
  PublishReleaseError,
  ReleasePlanError,
} from "@maestro/core";
import type { NoticeContent } from "../ui/notice";
import { type NoticeTable, noticeFromTable } from "../ui/notice-table";

// Every Harness notice, heading and sentence together (ADR-0025) — a new code
// in core fails typecheck here until it has a row. Screen names and control
// labels: `CONTEXT.md` → Screen names, `.claude/rules/copy.md` → R-D.

// The state read's two refusals ride in every other table below: a plan, a
// release and a proposed change all read the same harness first.
const harnessHeadings: NoticeTable<HarnessStateError> = {
  "not-configured": {
    level: "error",
    label: "No Harness connected",
    message: "Set the Harness location on the Inventory source screen.",
  },
  "no-usable-origin": {
    level: "error",
    label: "No GitHub origin",
    message: "Point the clone's origin at the Harness repository on GitHub.",
    detail: "Releases are published as tags, read over https or ssh.",
  },
};

const releasePlanHeadings: NoticeTable<ReleasePlanError> = {
  ...harnessHeadings,
  "no-answer": {
    level: "error",
    label: "No answer from GitHub",
    message: "Select Retry check, then Create a release again.",
    detail: "A release plan is measured against what GitHub holds.",
  },
};

const publishReleaseHeadings: NoticeTable<PublishReleaseError> = {
  ...harnessHeadings,
  "no-answer": {
    level: "error",
    label: "No answer from GitHub",
    message:
      "Nothing was published. Select Retry check, then Publish release again.",
  },
  "already-released": {
    level: "error",
    label: "Version number taken",
    message:
      "Maestro rebuilt the plan against the newest release. Check it, then Publish release.",
  },
  "plan-changed": {
    level: "error",
    label: "Plan out of date",
    message:
      "Nothing was published. Maestro rebuilt the plan, so check it, then Publish release.",
    detail: "GitHub moved while this dialog was open.",
  },
  "publish-failed": {
    level: "error",
    label: "Tag not pushed",
    message:
      "The Harness is as it was. Publish release again once GitHub is reachable.",
  },
  "publish-in-progress": {
    level: "error",
    label: "Release already running",
    message: "Wait for that release to finish, then Create a release again.",
    detail: "Maestro publishes one release at a time.",
  },
};

// A proposed change and a deletion share a heading wherever they share a code —
// the same thing goes wrong — but each states its own way through, so the
// sentences differ where the two ways through differ (#686).
const promoteHeadings: NoticeTable<PromoteSkillError> = {
  ...harnessHeadings,
  "invalid-skill": {
    level: "error",
    label: "Unusable skill name",
    message:
      "A skill name uses lowercase letters, digits and single hyphens, like code-review.",
  },
  "no-answer": {
    level: "error",
    label: "No answer from GitHub",
    message:
      "Nothing was pushed. Select Retry check, then Propose change again.",
  },
  "skill-missing": {
    level: "error",
    label: "Skill no longer in the Harness",
    message: "Nothing was pushed. Select Retry check to repaint the list.",
  },
  "push-elsewhere": {
    level: "error",
    label: "Different push remote",
    message: "Nothing was pushed. Point the clone's push remote at its origin.",
    detail: "Maestro publishes only to the origin it reads from.",
  },
  "source-changed": {
    level: "error",
    label: "Folder edit mid-read",
    message:
      "Nothing was pushed. Let the edit on disk finish, then Propose change again.",
  },
  "concurrent-change": {
    level: "error",
    label: "Newer change from a teammate",
    message:
      "Their version still stands. Pull it into the Harness clone, then Propose change again.",
  },
  "extra-requests": {
    level: "error",
    label: "Multiple pull requests",
    message:
      "Nothing was pushed. Close the extra requests on GitHub, then Propose change again.",
    detail: "More than one open pull request matches this skill's branch.",
  },
  "promote-failed": {
    level: "error",
    label: "Change not proposed",
    message:
      "The Harness is as it was. Propose change again once GitHub is reachable.",
  },
  "promote-in-progress": {
    level: "error",
    label: "Change already being proposed",
    message: "Wait for that change to finish, then Propose change again.",
    detail: "Maestro proposes one change at a time.",
  },
};

// Deliberately its own table, not a re-export: a code can refuse two surfaces
// with different words. Where the label holds for both, the row is shared and
// only the way through is rewritten.
const deletionHeadings: NoticeTable<PromoteDeletionError> = {
  ...harnessHeadings,
  "invalid-skill": promoteHeadings["invalid-skill"],
  "push-elsewhere": promoteHeadings["push-elsewhere"],
  "no-answer": {
    ...promoteHeadings["no-answer"],
    message: "Nothing was pushed. Select Retry check, then Delete skill again.",
  },
  "source-changed": {
    ...promoteHeadings["source-changed"],
    message: "Nothing was pushed. Select Retry check to repaint the list.",
  },
  "promote-in-progress": {
    ...promoteHeadings["promote-in-progress"],
    message: "Wait for that change to finish, then Delete skill again.",
  },
  "promote-failed": {
    ...promoteHeadings["promote-failed"],
    label: "Deletion not proposed",
    message:
      "The Harness is as it was. Delete skill again once GitHub is reachable.",
  },
  "extra-requests": {
    ...promoteHeadings["extra-requests"],
    message:
      "Nothing was pushed. Close the extra requests on GitHub, then Delete skill again.",
  },
  "confirmation-stale": {
    level: "error",
    label: "Confirmation out of date",
    message: "Nothing was pushed. Select Retry check, then Delete skill again.",
    detail: "The copy on the default branch moved after this confirmation.",
  },
  "not-deleted": {
    level: "error",
    label: "Skill still in the Harness",
    message: "Delete the skill folder in the Harness clone first.",
    detail: "A deletion publishes what the Harness working tree already says.",
  },
  "sparse-checkout": {
    level: "error",
    label: "Partial clone",
    message: "Nothing was pushed. Connect a complete clone to delete skills.",
    detail: "A missing folder in a partial clone is not proof of a deletion.",
  },
  "merge-in-progress": {
    level: "error",
    label: "Unfinished merge",
    message:
      "Nothing was pushed. Finish or abort the merge, then Delete skill again.",
    detail: "A half-merged working tree does not state what should go.",
  },
  "rebase-in-progress": {
    level: "error",
    label: "Unfinished rebase",
    message:
      "Nothing was pushed. Finish or abort the rebase, then Delete skill again.",
    detail: "A half-rebased working tree does not state what should go.",
  },
  "unresolved-conflicts": {
    level: "error",
    label: "Unresolved conflicts",
    message:
      "Nothing was pushed. Resolve the conflicts, then Delete skill again.",
    detail: "A conflicted working tree does not state what should go.",
  },
  unreadable: {
    level: "error",
    label: "Unreadable working tree",
    message:
      "Nothing was pushed. Make the Harness folder readable, then Delete skill again.",
  },
};

// The three GitHub-side mutations. Each refusal leaves the pull request and
// the clone as they were, so every sentence ends on another press of the same
// control (ADR-0025).
const proposalHeadings: NoticeTable<ProposalActionError> = {
  ...harnessHeadings,
  "invalid-skill": promoteHeadings["invalid-skill"],
  "no-answer": {
    level: "error",
    label: "No answer from GitHub",
    message: "Nothing changed on GitHub. Select Retry check.",
    detail:
      "Maestro could not read the branch this proposal is opened against.",
  },
  "review-unavailable": {
    level: "error",
    label: "Review status unavailable",
    message: "Sign in with gh auth login, then select Retry check.",
    detail: "Maestro reads pull requests through your own gh sign-in.",
  },
  "review-unknown": {
    level: "error",
    label: "Review status unknown",
    message: "Select Retry check to read GitHub again.",
    detail: "GitHub gave no answer Maestro can act on.",
  },
  "request-gone": {
    level: "error",
    label: "Pull request moved on",
    message: "Select Retry check to read what GitHub holds now.",
    detail: "This pull request is no longer the one open over this skill.",
  },
  "extra-requests": {
    level: "error",
    label: "Multiple pull requests",
    message: "Close the extra requests on GitHub, then select Retry check.",
    detail: "More than one open pull request matches this skill's branch.",
  },
  "request-exists": {
    level: "error",
    label: "Pull request already open",
    message: "Select Retry check to read the open pull request.",
    detail: "GitHub already holds an open request over this skill's branch.",
  },
  "action-failed": {
    level: "error",
    label: "Pull request unchanged",
    message: "Open the pull request on GitHub and make the change there.",
    detail: "GitHub refused the change Maestro asked for.",
  },
};

// Covers the import mutation and the check that runs before it: both blocker
// unions are subsets of this one, so a picked folder and a refused copy name
// the same fault the same way.
const importHeadings: NoticeTable<ImportSkillError> = {
  "not-configured": {
    ...harnessHeadings["not-configured"],
    message:
      "Set the Harness location on the Inventory source screen, then Import skill again.",
  },
  "source-unreadable": {
    level: "error",
    label: "Unreadable folder",
    message:
      "Nothing was copied. Make the folder readable, then pick it again.",
  },
  "outside-root": {
    level: "error",
    label: "Folder out of reach",
    message: "Pick a folder inside your home folder.",
    detail: "Maestro reads inside the home folder only.",
  },
  "deployed-copy": {
    level: "error",
    label: "Copy from another Harness",
    message: "Select Change folder, then pick a folder you wrote yourself.",
    detail:
      "Only a copy the connected Harness deployed can be carried back into it.",
  },
  "harness-copy-uncommitted": {
    level: "error",
    label: "Uncommitted changes in the Harness",
    message:
      "Commit or undo the Harness's own changes to this skill, then Update skill again.",
    detail: "Replacing the folder now would take work git has no record of.",
  },
  "harness-unreadable": {
    level: "error",
    label: "Unreadable Harness clone",
    message:
      "Nothing was copied. Make the Harness clone readable, then Update skill again.",
    detail:
      "Maestro reads the clone's committed state before replacing a skill.",
  },
  // Info, not error: the folder is the right one and nothing is wrong with it,
  // there is simply nothing in it to carry back (#733).
  "nothing-to-carry-back": {
    level: "info",
    label: "Nothing to carry back",
    message: "This folder matches the skill the Harness holds. Select Close.",
    detail: "Only a changed file can be carried back.",
  },
  "missing-manifest": {
    level: "error",
    label: "No SKILL.md",
    message: "Pick the folder that holds the skill's SKILL.md.",
  },
  "invalid-frontmatter": {
    level: "error",
    label: "Unreadable frontmatter",
    message: "Fix the SKILL.md frontmatter, then Import skill again.",
    detail: "Maestro cannot read the skill's name or description.",
  },
  "empty-description": {
    level: "error",
    label: "Empty description",
    message: "Fill in the description in SKILL.md, then Import skill again.",
    detail: "The description tells an agent when to reach for the skill.",
  },
  "invalid-name": {
    level: "error",
    label: "Unusable skill name",
    message:
      "A skill name uses lowercase letters, digits and single hyphens, like code-review.",
  },
  "name-taken": {
    level: "error",
    label: "Name taken",
    message: "The Harness already holds a skill under it. Pick another name.",
  },
  "not-found": {
    level: "error",
    label: "Folder gone",
    message: "Nothing was copied. Pick the folder again.",
  },
  "not-a-directory": {
    level: "error",
    label: "Not a folder",
    message: "A skill is a folder with a SKILL.md in it. Pick one of those.",
  },
  "destination-exists": {
    level: "error",
    label: "Name taken",
    message: "The Harness already holds a folder under it. Pick another name.",
  },
  "unsafe-link": {
    level: "error",
    label: "Symbolic link inside",
    message:
      "Nothing was copied. Replace the link with a real file, then Import skill again.",
    detail: "Maestro will not follow one into somewhere else on disk.",
  },
  "hard-linked-file": {
    level: "error",
    label: "Shared file inside",
    message:
      "Nothing was copied. Replace it with a plain copy, then Import skill again.",
    detail: "Copying it would tie the Harness to a file it does not own.",
  },
  "special-file": {
    level: "error",
    label: "Special file inside",
    message:
      "Nothing was copied. Take it out of the folder, then Import skill again.",
    detail: "Maestro carries plain files and folders only.",
  },
  "too-many-files": {
    level: "error",
    label: "Over 1,000 files",
    message:
      "Nothing was copied. Pick the skill folder itself, not the repository around it.",
  },
  "too-large": {
    level: "error",
    label: "Over 50 MiB",
    message:
      "Nothing was copied. Pick the skill folder itself, not the repository around it.",
  },
  "source-changed": {
    level: "error",
    label: "Folder edit mid-copy",
    message:
      "Nothing was left in the Harness. Let the edit on disk finish, then Import skill again.",
  },
  "copy-failed": {
    level: "error",
    label: "Unfinished copy",
    message:
      "Nothing was left in the Harness. Free up disk space, then Import skill again.",
  },
  "destination-unsafe": {
    level: "error",
    label: "Skills folder outside the Harness",
    message:
      "Nothing was copied. Make the clone's skills folder a real folder inside it.",
  },
};

// The same words the promote table refuses a press with, painted on the row
// before any press. Info, not warning: a warning is a way through at a cost
// (#465, decision 3), and pulling the teammate's change is the only way here.
export const CONCURRENT_CHANGE_NOTICE: NoticeContent = {
  ...promoteHeadings["concurrent-change"],
  level: "info",
};

// One fallback per surface: a failure no row covers still costs each of these
// something different, and the sentence says which (#688).
export const harnessStateNotice = (error: unknown): NoticeContent | null =>
  noticeFromTable(harnessHeadings, error, {
    label: "Harness not read",
    message:
      "The Maestro server did not answer. Reload the page to read the Harness again.",
  });

export const refreshNotice = (error: unknown): NoticeContent | null =>
  noticeFromTable(harnessHeadings, error, {
    label: "GitHub not read",
    message:
      "The Maestro server did not answer, so the Harness is as it was. Select Retry check.",
  });

// Not a failed press but a failed read: the rows below stand, dated to the
// last read that answered. Null before any read has ever succeeded — nothing
// is out of date yet, and the stage labels carry that state instead (#848).
export const staleStatusNotice = (
  freshness: HarnessFreshness,
  onRetry: () => void,
): NoticeContent | null => {
  if (
    freshness.lastFetchedAt === null ||
    (freshness.outcome !== "offline" && freshness.outcome !== "fetch-failed")
  ) {
    return null;
  }
  return {
    level: "warning",
    label: "Status out of date",
    message: "Select Retry check to read GitHub again.",
    detail:
      freshness.outcome === "offline"
        ? "Maestro could not reach GitHub, so these rows are from the last read."
        : "GitHub gave no answer, so these rows are from the last read.",
    action: { label: "Retry check", onClick: onRetry },
  };
};

// What a publication landed, and the one place the cockpit states that a
// release is final (#827). The tag is atomic, so the Inventory re-read is the
// only half that can fail on its own: both outcomes keep the heading, the
// subject and the detail, and the way back is written into the sentence (#849).
export const releasePublishedNotice = (
  tag: string,
  inventoryRefreshed: boolean,
  onReread: () => void,
): NoticeContent =>
  inventoryRefreshed
    ? {
        level: "success",
        label: "Release published",
        message: `Maestro tagged ${tag} and refreshed Inventory.`,
        detail: "A release cannot change after publication.",
      }
    : {
        level: "warning",
        label: "Release published",
        message: `Maestro tagged ${tag} but could not refresh Inventory. Re-read Inventory to see the published skills.`,
        detail: "A release cannot change after publication.",
        action: { label: "Re-read Inventory", onClick: onReread },
      };

export const releasePlanNotice = (error: unknown): NoticeContent | null =>
  noticeFromTable(releasePlanHeadings, error, {
    label: "Release plan not read",
    message:
      "The Maestro server did not answer, so no version was worked out. Open the release again.",
  });

export const publishReleaseNotice = (error: unknown): NoticeContent | null =>
  noticeFromTable(publishReleaseHeadings, error, {
    label: "Release not published",
    message:
      "The Maestro server did not answer, and no tag was pushed. Publish release again.",
  });

export const promoteNotice = (error: unknown): NoticeContent | null =>
  noticeFromTable(promoteHeadings, error, {
    label: "Change not proposed",
    message:
      "The Maestro server did not answer, and nothing was pushed. Propose change again.",
  });

export const deletionNotice = (error: unknown): NoticeContent | null =>
  noticeFromTable(deletionHeadings, error, {
    label: "Deletion not proposed",
    message:
      "The Maestro server did not answer, and nothing was pushed. Delete skill again.",
  });

export const proposalNotice = (error: unknown): NoticeContent | null =>
  noticeFromTable(proposalHeadings, error, {
    label: "Pull request unchanged",
    message:
      "The Maestro server did not answer, and GitHub is as it was. Start the change again.",
  });

export const importNotice = (error: unknown): NoticeContent | null =>
  noticeFromTable(importHeadings, error, {
    label: "Skill not imported",
    message:
      "The Maestro server did not answer, and nothing reached the Harness. Import skill again.",
  });

// The check's refusals never travel as an HTTP failure — they come back in a
// successful reply. The table's own sentence stands unless the dialog's way
// through differs, which `import-view-model` says where it does.
export const importBlockerNotice = (
  blocker: ImportSourceBlocker | ImportNameBlocker,
  message?: string,
): NoticeContent =>
  message === undefined
    ? importHeadings[blocker]
    : { ...importHeadings[blocker], message };
