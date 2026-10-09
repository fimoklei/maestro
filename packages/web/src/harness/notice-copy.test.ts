import { describe, expect, it } from "vitest";
import { HttpError } from "../api/http";
import { machineValues, readNotice } from "../test-utils";
import type { NoticeContent } from "../ui/notice";
import { localDeletionNotice } from "./local-deletion-copy";
import {
  CONCURRENT_CHANGE_NOTICE,
  deletionNotice,
  discardNotice,
  harnessStateNotice,
  importNotice,
  localEditsRefusal,
  promoteNotice,
  proposalNotice,
  publishReleaseNotice,
  refreshNotice,
  releasePlanNotice,
  releasePublishedNotice,
  restoreNotice,
  skillRestoredNotice,
  stageReadNotice,
  staleStatusNotice,
} from "./notice-copy";

type Case = [code: string, expected: NoticeContent];

const notice = (
  read: (error: unknown) => NoticeContent | null,
  code: string,
): NoticeContent | null => read(new HttpError(422, "", code));

const NOT_CONFIGURED: NoticeContent = {
  level: "error",
  label: "No Harness connected",
  message: "Select Change Harness location in Settings.",
};

const NO_USABLE_ORIGIN: NoticeContent = {
  level: "error",
  label: "No GitHub origin",
  message: "Point the clone's origin at the Harness repository on GitHub.",
  detail: "Releases are published as tags, read over https or ssh.",
};

const UNUSABLE_NAME: NoticeContent = {
  level: "error",
  label: "Unusable skill name",
  message:
    "A skill name uses lowercase letters, digits and single hyphens, like code-review.",
};

const PUSH_ELSEWHERE: NoticeContent = {
  level: "error",
  label: "Different push remote",
  message: "Nothing was pushed. Point the clone's push remote at its origin.",
  detail: "Maestro publishes only to the origin it reads from.",
};

const CONCURRENT_CHANGE: NoticeContent = {
  level: "error",
  label: "Newer change from a teammate",
  message:
    "Their version still stands. Pull it into the Harness clone, then Propose change again.",
};

const suites: [
  name: string,
  read: (error: unknown) => NoticeContent | null,
  fallback: NoticeContent,
  cases: Case[],
][] = [
  [
    "harnessStateNotice",
    harnessStateNotice,
    {
      level: "error",
      label: "Harness not read",
      message:
        "The Maestro server did not answer. Select Re-read Harness to read the Harness again.",
    },
    [
      ["not-configured", NOT_CONFIGURED],
      ["no-usable-origin", NO_USABLE_ORIGIN],
    ],
  ],
  [
    "refreshNotice",
    refreshNotice,
    {
      level: "error",
      label: "GitHub not read",
      message:
        "The Maestro server did not answer, so the Harness is as it was. Select Re-read Harness.",
    },
    [
      ["not-configured", NOT_CONFIGURED],
      ["no-usable-origin", NO_USABLE_ORIGIN],
    ],
  ],
  [
    "releasePlanNotice",
    releasePlanNotice,
    {
      level: "error",
      label: "Release plan not read",
      message:
        "The Maestro server did not answer, so no version was worked out. Open the release again.",
    },
    [
      ["not-configured", NOT_CONFIGURED],
      ["no-usable-origin", NO_USABLE_ORIGIN],
      [
        "no-answer",
        {
          level: "error",
          label: "GitHub did not respond",
          message: "Select Re-read Harness, then Create a release again.",
          detail: "A release plan is measured against what GitHub holds.",
        },
      ],
    ],
  ],
  [
    "publishReleaseNotice",
    publishReleaseNotice,
    {
      level: "error",
      label: "Release not published",
      message:
        "The Maestro server did not answer, and no tag was pushed. Publish release again.",
    },
    [
      ["not-configured", NOT_CONFIGURED],
      ["no-usable-origin", NO_USABLE_ORIGIN],
      [
        "no-answer",
        {
          level: "error",
          label: "GitHub did not respond",
          message:
            "Nothing was published. Select Re-read Harness, then Publish release again.",
        },
      ],
      [
        "empty-delta",
        {
          level: "error",
          label: "Nothing to release",
          message:
            "Nothing was published. No skill has changed since the last release.",
        },
      ],
      [
        "already-released",
        {
          level: "error",
          label: "Release already exists",
          message:
            "Maestro rebuilt the plan against the newest release. Check it, then Publish release.",
        },
      ],
      [
        "plan-changed",
        {
          level: "error",
          label: "Release plan changed",
          message:
            "Nothing was published. Maestro rebuilt the plan, so check it, then Publish release.",
          detail: "GitHub moved while this dialog was open.",
        },
      ],
      [
        "publish-failed",
        {
          level: "error",
          label: "Release not published",
          message:
            "The Harness is as it was. Publish release again once GitHub is reachable.",
        },
      ],
      [
        "publish-in-progress",
        {
          level: "error",
          label: "Harness busy",
          message:
            "Wait for that release to finish, then Create a release again.",
          detail: "Maestro publishes one release at a time.",
        },
      ],
    ],
  ],
  [
    "promoteNotice",
    promoteNotice,
    {
      level: "error",
      label: "Change not proposed",
      message:
        "The Maestro server did not answer, and nothing was pushed. Propose change again.",
    },
    [
      ["not-configured", NOT_CONFIGURED],
      ["no-usable-origin", NO_USABLE_ORIGIN],
      ["invalid-skill", UNUSABLE_NAME],
      ["push-elsewhere", PUSH_ELSEWHERE],
      ["concurrent-change", CONCURRENT_CHANGE],
      [
        "no-answer",
        {
          level: "error",
          label: "GitHub did not respond",
          message:
            "Nothing was pushed. Select Re-read Harness, then Propose change again.",
        },
      ],
      [
        "skill-missing",
        {
          level: "error",
          label: "Skill no longer in the Harness",
          message:
            "Nothing was pushed. Select Re-read Harness to read the list again.",
        },
      ],
      [
        "extra-requests",
        {
          level: "error",
          label: "Multiple pull requests",
          message:
            "Nothing was pushed. Select a View pull request link to close the extras, then Propose change again.",
          detail:
            "More than one open pull request matches this skill's branch.",
        },
      ],
      [
        "proposed-by-other",
        {
          level: "error",
          label: "Another contributor's pull request is open",
          message:
            "Nothing was pushed. Wait until it is merged or closed, then Propose change again.",
          detail: "Only one contributor proposes to a skill at a time.",
        },
      ],
      [
        "source-changed",
        {
          level: "error",
          label: "Files changed during the check",
          message:
            "Nothing was pushed. Let the edit on disk finish, then Propose change again.",
        },
      ],
      [
        "promote-failed",
        {
          level: "error",
          label: "Change not proposed",
          message:
            "The Harness is as it was. Propose change again once GitHub is reachable.",
        },
      ],
      [
        "promote-in-progress",
        {
          level: "error",
          label: "Harness busy",
          message: "Wait for that change to finish, then Propose change again.",
          detail: "Maestro proposes one change at a time.",
        },
      ],
    ],
  ],
  [
    "deletionNotice",
    deletionNotice,
    {
      level: "error",
      label: "Deletion not proposed",
      message:
        "The Maestro server did not answer, and nothing was pushed. Delete skill again.",
    },
    [
      ["not-configured", NOT_CONFIGURED],
      ["no-usable-origin", NO_USABLE_ORIGIN],
      ["invalid-skill", UNUSABLE_NAME],
      ["push-elsewhere", PUSH_ELSEWHERE],
      [
        "no-answer",
        {
          level: "error",
          label: "GitHub did not respond",
          message:
            "Nothing was pushed. Select Re-read Harness, then Delete skill again.",
        },
      ],
      [
        "source-changed",
        {
          level: "error",
          label: "Files changed during the check",
          message:
            "Nothing was pushed. Select Re-read Harness to read the list again.",
        },
      ],
      [
        "promote-in-progress",
        {
          level: "error",
          label: "Harness busy",
          message: "Wait for that change to finish, then Delete skill again.",
          detail: "Maestro proposes one change at a time.",
        },
      ],
      [
        "promote-failed",
        {
          level: "error",
          label: "Deletion not proposed",
          message:
            "The Harness is as it was. Delete skill again once GitHub is reachable.",
        },
      ],
      [
        "extra-requests",
        {
          level: "error",
          label: "Multiple pull requests",
          message:
            "Nothing was pushed. Select a View pull request link to close the extras, then Delete skill again.",
          detail:
            "More than one open pull request matches this skill's branch.",
        },
      ],
      [
        "proposed-by-other",
        {
          level: "error",
          label: "Another contributor's pull request is open",
          message:
            "Nothing was pushed. Wait until it is merged or closed, then Delete skill again.",
          detail: "Only one contributor proposes to a skill at a time.",
        },
      ],
      [
        "confirmation-stale",
        {
          level: "error",
          label: "Confirmation out of date",
          message:
            "Nothing was pushed. Select Re-read Harness, then Delete skill again.",
          detail:
            "The copy on the default branch moved after this confirmation.",
        },
      ],
      [
        "not-deleted",
        {
          level: "error",
          label: "Skill still in the Harness",
          message: "Delete the skill folder in the Harness clone first.",
          detail:
            "A deletion publishes what the Harness working tree already says.",
        },
      ],
      [
        "sparse-checkout",
        {
          level: "error",
          label: "Partial clone",
          message:
            "Nothing was pushed. Connect a complete clone to delete skills.",
          detail:
            "A missing folder in a partial clone is not proof of a deletion.",
        },
      ],
      [
        "merge-in-progress",
        {
          level: "error",
          label: "Unfinished merge",
          message:
            "Nothing was pushed. Finish or abort the merge, then Delete skill again.",
          detail: "A half-merged working tree does not state what should go.",
        },
      ],
      [
        "rebase-in-progress",
        {
          level: "error",
          label: "Unfinished rebase",
          message:
            "Nothing was pushed. Finish or abort the rebase, then Delete skill again.",
          detail: "A half-rebased working tree does not state what should go.",
        },
      ],
      [
        "unresolved-conflicts",
        {
          level: "error",
          label: "Unresolved conflicts",
          message:
            "Nothing was pushed. Resolve the conflicts, then Delete skill again.",
          detail: "A conflicted working tree does not state what should go.",
        },
      ],
      [
        "unreadable",
        {
          level: "error",
          label: "Unreadable working tree",
          message:
            "Nothing was pushed. Make the Harness folder readable, then Delete skill again.",
        },
      ],
    ],
  ],
  [
    "localDeletionNotice",
    (error) => localDeletionNotice(error, { skill: "tdd", screen: "harness" }),
    {
      level: "error",
      label: "Skill not deleted",
      message:
        "The Maestro server did not answer, and the Harness is as it was. Delete skill again.",
    },
    [
      ["not-configured", NOT_CONFIGURED],
      ["invalid-skill", UNUSABLE_NAME],
      [
        "already-gone",
        {
          level: "error",
          label: "Folder already deleted",
          message: "Select Re-read Harness to see the skill as it is now.",
          detail:
            "Something removed the tdd folder from your clone after this dialog opened.",
        },
      ],
      [
        "confirmation-stale",
        {
          level: "error",
          label: "Confirmation out of date",
          message:
            "Nothing was deleted. The dialog now shows the folder as it is. Select Delete skill to delete it.",
          detail: "The tdd folder changed after this dialog opened.",
        },
      ],
      [
        "no-answer",
        {
          level: "error",
          label: "Clone not read",
          message:
            "Nothing was deleted. Close this dialog, then select Delete skill again.",
          detail: "Git could not read your clone.",
        },
      ],
      [
        "destination-unsafe",
        {
          level: "error",
          label: "Folder outside the Harness",
          message:
            "Nothing was deleted. Replace the link with a real folder, then Delete skill again.",
          detail:
            "The skill folder resolves outside the Harness skills folder.",
        },
      ],
      [
        "delete-failed",
        {
          level: "error",
          label: "Skill not deleted",
          message:
            "The Harness is as it was. Make the folder writable, then Delete skill again.",
        },
      ],
      [
        "delete-in-progress",
        {
          level: "error",
          label: "Harness busy",
          message: "Wait for that change to finish, then Delete skill again.",
          detail: "Maestro changes one Harness at a time.",
        },
      ],
    ],
  ],
  [
    "importNotice",
    importNotice,
    {
      level: "error",
      label: "Skill not imported",
      message:
        "The Maestro server did not answer, and nothing reached the Harness. Import skill again.",
    },
    [
      [
        "not-configured",
        {
          level: "error",
          label: "No Harness connected",
          message:
            "Select Change Harness location in Settings, then select Import skill again.",
        },
      ],
      [
        "source-unreadable",
        {
          level: "error",
          label: "Unreadable folder",
          message:
            "Nothing was copied. Make the folder readable, then choose it again.",
        },
      ],
      [
        "outside-root",
        {
          level: "error",
          label: "Folder out of reach",
          message: "Choose a folder inside your home folder.",
          detail: "Maestro reads inside the home folder only.",
        },
      ],
      [
        "missing-manifest",
        {
          level: "error",
          label: "No SKILL.md",
          message: "Choose the folder that holds the skill's SKILL.md.",
        },
      ],
      [
        "invalid-frontmatter",
        {
          level: "error",
          label: "Unreadable frontmatter",
          message: "Fix the SKILL.md frontmatter, then Import skill again.",
          detail: "Maestro cannot read the skill's name or description.",
        },
      ],
      [
        "empty-description",
        {
          level: "error",
          label: "Empty description",
          message:
            "Fill in the description in SKILL.md, then Import skill again.",
          detail: "The description tells an agent when to reach for the skill.",
        },
      ],
      ["invalid-name", UNUSABLE_NAME],
      [
        "name-taken",
        {
          level: "error",
          label: "Name taken",
          message:
            "The Harness already holds a skill under it. Pick another name.",
        },
      ],
      [
        "not-found",
        {
          level: "error",
          label: "Folder gone",
          message: "Nothing was copied. Choose the folder again.",
        },
      ],
      [
        "not-a-directory",
        {
          level: "error",
          label: "Not a folder",
          message:
            "A skill is a folder with a SKILL.md in it. Choose one of those.",
        },
      ],
      [
        "destination-exists",
        {
          level: "error",
          label: "Name taken",
          message:
            "The Harness already holds a folder under it. Pick another name.",
        },
      ],
      [
        "unsafe-link",
        {
          level: "error",
          label: "Symbolic link inside",
          message:
            "Nothing was copied. Replace the link with a real file, then Import skill again.",
          detail: "Maestro will not follow one into somewhere else on disk.",
        },
      ],
      [
        "hard-linked-file",
        {
          level: "error",
          label: "Shared file inside",
          message:
            "Nothing was copied. Replace it with a plain copy, then Import skill again.",
          detail: "Copying it would tie the Harness to a file it does not own.",
        },
      ],
      [
        "special-file",
        {
          level: "error",
          label: "Special file inside",
          message:
            "Nothing was copied. Take it out of the folder, then Import skill again.",
          detail: "Maestro carries plain files and folders only.",
        },
      ],
      [
        "too-many-files",
        {
          level: "error",
          label: "Over 1,000 files",
          message:
            "Nothing was copied. Choose the skill folder itself, not the repository around it.",
        },
      ],
      [
        "too-large",
        {
          level: "error",
          label: "Over 50 MiB",
          message:
            "Nothing was copied. Choose the skill folder itself, not the repository around it.",
        },
      ],
      [
        "source-changed",
        {
          level: "error",
          label: "Folder changed during import",
          message:
            "The skill was not imported. Let the folder change finish, then Import skill again.",
        },
      ],
      [
        "copy-failed",
        {
          level: "error",
          label: "Skill not imported",
          message:
            "The skill was not imported. Free up disk space, then Import skill again.",
        },
      ],
      [
        "destination-unsafe",
        {
          level: "error",
          label: "Skills folder outside the Harness",
          message:
            "Nothing was copied. Make the clone's skills folder a real folder inside it.",
        },
      ],
      [
        "deployed-copy",
        {
          level: "error",
          label: "Copy from another Harness",
          message:
            "Choose a folder that is not a copy deployed by another Harness.",
          detail:
            "Maestro can update only copies deployed by the connected Harness.",
        },
      ],
      [
        "origin-unproven",
        {
          level: "error",
          label: "Origin not recorded",
          message: "Copy the skill's files into the Harness clone yourself.",
          detail: "The deployment record does not name this copy's Harness.",
        },
      ],
      [
        "harness-copy-uncommitted",
        {
          level: "error",
          label: "Uncommitted changes in the Harness",
          message:
            "Nothing was copied. Commit or undo them in your Git tool, then select Update skill again.",
          detail: "Updating now would overwrite changes Git cannot restore.",
        },
      ],
      [
        "harness-unreadable",
        {
          level: "error",
          label: "Unreadable Harness clone",
          message:
            "Nothing was copied. Make the Harness clone readable, then Update skill again.",
          detail:
            "Maestro reads the clone's committed state before replacing a skill.",
        },
      ],
      [
        "nothing-to-carry-back",
        {
          level: "info",
          label: "Folder already matches",
          message:
            "This folder already matches the skill in the Harness. Select Close.",
          detail: "Choose a folder with changes to update the skill.",
        },
      ],
    ],
  ],
  [
    "proposalNotice",
    proposalNotice,
    {
      level: "error",
      label: "Pull request unchanged",
      message:
        "The Maestro server did not answer, and GitHub is as it was. Start the change again.",
    },
    // The three actions share one table, so no row may name one action's
    // button.
    [
      ["not-configured", NOT_CONFIGURED],
      ["invalid-skill", UNUSABLE_NAME],
      [
        "no-answer",
        {
          level: "error",
          label: "GitHub did not respond",
          message: "Nothing changed on GitHub. Select Re-read Harness.",
          detail:
            "Maestro could not read the branch this proposal is opened against.",
        },
      ],
      [
        "review-unavailable",
        {
          level: "error",
          label: "Review status unavailable",
          message: "Sign in with gh auth login, then select Re-read Harness.",
          detail: "Maestro reads pull requests through your own gh sign-in.",
        },
      ],
      [
        "review-unknown",
        {
          level: "error",
          label: "Review status unknown",
          message: "Select Re-read Harness to read GitHub again.",
          detail: "GitHub gave no answer Maestro can act on.",
        },
      ],
      [
        "extra-requests",
        {
          level: "error",
          label: "Multiple pull requests",
          message:
            "Select a View pull request link to close the extras, then select Re-read Harness.",
          detail:
            "More than one open pull request matches this skill's branch.",
        },
      ],
      [
        "proposed-by-other",
        {
          level: "error",
          label: "Another contributor's pull request",
          message:
            "Only its author can change it. Select Re-read Harness to read GitHub again.",
          detail: "Only one contributor proposes to a skill at a time.",
        },
      ],
    ],
  ],
  [
    "restoreNotice",
    restoreNotice,
    {
      level: "error",
      label: "Skill not restored",
      message:
        "Nothing was restored. The Maestro server did not answer. Restore skill again.",
    },
    [
      [
        "not-configured",
        {
          level: "error",
          label: "No Harness connected",
          message:
            "Nothing was restored. Select Change Harness location in Settings.",
        },
      ],
      [
        "invalid-skill",
        {
          level: "error",
          label: "Unusable skill name",
          message:
            "Nothing was restored. A skill name uses lowercase letters, digits and single hyphens, like code-review.",
        },
      ],
      [
        "head-moved",
        {
          level: "error",
          label: "Confirmation out of date",
          message:
            "Nothing was restored. Select Re-read Harness, then Restore skill again.",
          detail: "Your clone's last commit moved after this confirmation.",
        },
      ],
      [
        "staged-changes",
        {
          level: "error",
          label: "Skill has staged changes",
          message:
            "Nothing was restored. Unstage this skill in your Git tool, then Restore skill again.",
          detail: "Maestro never changes what you staged.",
        },
      ],
      [
        "not-in-commit",
        {
          level: "error",
          label: "Skill not in your last commit",
          message:
            "Nothing was restored. Recover the folder in your Git tool instead.",
          detail: "Maestro restores only what your last local commit holds.",
        },
      ],
      [
        "destination-exists",
        {
          level: "error",
          label: "Folder already there",
          message:
            "Nothing was restored. Move the folder in the Harness clone, then Restore skill again.",
          detail: "Something already sits where this skill folder belongs.",
        },
      ],
      [
        "destination-unsafe",
        {
          level: "error",
          label: "Folder outside the Harness",
          message:
            "Nothing was restored. Replace the link with a real folder, then Restore skill again.",
          detail:
            "The skill folder resolves outside the Harness skills folder.",
        },
      ],
      [
        "restore-in-progress",
        {
          level: "error",
          label: "Harness busy",
          message:
            "Nothing was restored. Wait for that change to finish, then Restore skill again.",
          detail: "Maestro changes one Harness at a time.",
        },
      ],
      [
        "restore-failed",
        {
          level: "error",
          label: "Skill not restored",
          message:
            "Nothing was restored. Make the Harness skills folder writable, then Restore skill again.",
        },
      ],
      [
        "sparse-checkout",
        {
          level: "error",
          label: "Partial clone",
          message:
            "Nothing was restored. Connect a complete clone to restore skills.",
          detail:
            "A missing folder in a partial clone is not proof of a deletion.",
        },
      ],
      [
        "merge-in-progress",
        {
          level: "error",
          label: "Unfinished merge",
          message:
            "Nothing was restored. Finish or abort the merge, then Restore skill again.",
          detail: "A half-merged working tree does not state what is missing.",
        },
      ],
      [
        "rebase-in-progress",
        {
          level: "error",
          label: "Unfinished rebase",
          message:
            "Nothing was restored. Finish or abort the rebase, then Restore skill again.",
          detail: "A half-rebased working tree does not state what is missing.",
        },
      ],
      [
        "unresolved-conflicts",
        {
          level: "error",
          label: "Unresolved conflicts",
          message:
            "Nothing was restored. Resolve the conflicts, then Restore skill again.",
          detail: "A conflicted working tree does not state what is missing.",
        },
      ],
      [
        "unreadable",
        {
          level: "error",
          label: "Unreadable working tree",
          message:
            "Nothing was restored. Make the Harness folder readable, then Restore skill again.",
        },
      ],
      [
        "source-unreadable",
        {
          level: "error",
          label: "Committed copy unreadable",
          message:
            "Nothing was restored. Check the Harness clone with your Git tool, then Restore skill again.",
          detail:
            "Maestro could not read this skill out of your last local commit.",
        },
      ],
      [
        "destination-unreadable",
        {
          level: "error",
          label: "Skills folder missing",
          message:
            "Nothing was restored. Put the .apm/skills folder back in the Harness clone, then Restore skill again.",
          detail: "Maestro could not read the Harness skills folder.",
        },
      ],
    ],
  ],
  [
    "discardNotice",
    (error: unknown) => discardNotice(error, "tdd"),
    {
      level: "error",
      label: "Change not discarded",
      message:
        "Nothing was discarded. The Maestro server did not answer. Discard change again.",
    },
    [
      [
        "not-configured",
        {
          level: "error",
          label: "No Harness connected",
          message:
            "Nothing was discarded. Select Change Harness location in Settings.",
        },
      ],
      [
        "invalid-skill",
        {
          level: "error",
          label: "Unusable skill name",
          message:
            "Nothing was discarded. A skill name uses lowercase letters, digits and single hyphens, like code-review.",
        },
      ],
      [
        "no-answer",
        {
          level: "error",
          label: "Clone not read",
          message:
            "Nothing was discarded. Close this dialog, then select Discard change again.",
          detail: "Git could not read your clone.",
        },
      ],
      [
        "already-proposed",
        {
          level: "error",
          label: "Change already proposed",
          message:
            "Nothing was discarded. Select Re-read Harness to see the skill as it is now.",
          detail: "tdd now has a proposal branch or pull request.",
        },
      ],
      [
        "nothing-to-discard",
        {
          level: "error",
          label: "Nothing to discard",
          message:
            "Nothing was discarded. Select Re-read Harness to see the skill as it is now.",
          detail: "tdd has no change that waits for a proposal.",
        },
      ],
      [
        "confirmation-stale",
        {
          level: "error",
          label: "Confirmation out of date",
          message:
            "Nothing was discarded. Select Re-read Harness, then Discard change again.",
          detail: "The default branch moved after this confirmation.",
        },
      ],
      [
        "destination-unsafe",
        {
          level: "error",
          label: "Folder outside the Harness",
          message:
            "Nothing was discarded. Replace the link with a real folder, then Discard change again.",
          detail:
            "The skill folder resolves outside the Harness skills folder.",
        },
      ],
      [
        "discard-in-progress",
        {
          level: "error",
          label: "Harness busy",
          message:
            "Nothing was discarded. Wait for that change to finish, then Discard change again.",
          detail: "Maestro changes one Harness at a time.",
        },
      ],
      [
        "discard-failed",
        {
          level: "error",
          label: "Change not discarded",
          message:
            "Nothing was discarded. Make the Harness skills folder writable, then Discard change again.",
        },
      ],
      [
        "sparse-checkout",
        {
          level: "error",
          label: "Partial clone",
          message:
            "Nothing was discarded. Connect a complete clone to discard changes.",
          detail: "A partial clone does not hold every file of the skill.",
        },
      ],
      [
        "merge-in-progress",
        {
          level: "error",
          label: "Unfinished merge",
          message:
            "Nothing was discarded. Finish or abort the merge, then Discard change again.",
          detail: "A half-merged working tree does not state what changed.",
        },
      ],
      [
        "rebase-in-progress",
        {
          level: "error",
          label: "Unfinished rebase",
          message:
            "Nothing was discarded. Finish or abort the rebase, then Discard change again.",
          detail: "A half-rebased working tree does not state what changed.",
        },
      ],
      [
        "unresolved-conflicts",
        {
          level: "error",
          label: "Unresolved conflicts",
          message:
            "Nothing was discarded. Resolve the conflicts, then Discard change again.",
          detail: "A conflicted working tree does not state what changed.",
        },
      ],
      [
        "unreadable",
        {
          level: "error",
          label: "Unreadable working tree",
          message:
            "Nothing was discarded. Make the Harness folder readable, then Discard change again.",
        },
      ],
    ],
  ],
];

describe.each(suites)("%s", (_name, read, fallback, cases) => {
  it.each(cases)("states the whole notice for %s", (code, expected) => {
    expect(readNotice(notice(read, code))).toEqual(expected);
  });

  it("states its own cost when no row covers the failure", () => {
    expect(notice(read, "a-code-this-build-predates")).toEqual(fallback);
  });

  it("shows nothing without an error", () => {
    expect(read(null)).toBeNull();
  });
});

describe("localDeletionNotice on Inventory", () => {
  it("names Inventory's own way to the Harness view for a folder already gone", () => {
    expect(
      localDeletionNotice(new HttpError(409, "", "already-gone"), {
        skill: "tdd",
        screen: "inventory",
      })?.message,
    ).toBe("Select Harness to see the skill as it is now.");
  });
});

describe("staleStatusNotice", () => {
  const retry = () => {};
  const READ_AT = "2026-08-03T11:56:00.000Z";

  it("states the whole notice when a fetch failed over an earlier read", () => {
    expect(
      staleStatusNotice(
        { outcome: "fetch-failed", lastFetchedAt: READ_AT },
        retry,
      ),
    ).toEqual({
      level: "warning",
      label: "Status out of date",
      message: "Select Re-read Harness to read GitHub again.",
      detail: "GitHub gave no answer, so these rows are from the last read.",
      action: { label: "Re-read Harness", onClick: retry },
    });
  });

  it("names being offline as the cause where that is the cause", () => {
    expect(
      staleStatusNotice({ outcome: "offline", lastFetchedAt: READ_AT }, retry)
        ?.detail,
    ).toBe(
      "Maestro could not reach GitHub, so these rows are from the last read.",
    );
  });

  it("shows nothing where no read has ever succeeded", () => {
    // Nothing is out of date yet: the stage labels carry that state instead.
    expect(
      staleStatusNotice({ outcome: "offline", lastFetchedAt: null }, retry),
    ).toBeNull();
  });

  it("shows nothing while the last fetch answered", () => {
    expect(
      staleStatusNotice({ outcome: "fetched", lastFetchedAt: READ_AT }, retry),
    ).toBeNull();
    expect(
      staleStatusNotice({ outcome: null, lastFetchedAt: null }, retry),
    ).toBeNull();
  });
});

describe("stageReadNotice", () => {
  const retry = () => {};

  it("names the gh sign-in a stage nobody could read needs", () => {
    expect(
      stageReadNotice(
        { outcome: "unavailable" },
        "Review status unavailable",
        retry,
      ),
    ).toEqual({
      level: "warning",
      label: "Review status unavailable",
      message: "Sign in with gh auth login, then select Re-read Harness.",
      detail: "Maestro reads pull requests through your own gh sign-in.",
      action: { label: "Re-read Harness", onClick: retry },
    });
  });

  it("states the whole notice for a stage GitHub gave no answer for", () => {
    expect(
      stageReadNotice({ outcome: "unknown" }, "Status unknown", retry),
    ).toEqual({
      level: "warning",
      label: "Status unknown",
      message: "Select Re-read Harness to read GitHub again.",
      detail: "GitHub gave no answer Maestro can act on.",
      action: { label: "Re-read Harness", onClick: retry },
    });
  });

  it("shows nothing for a stage that was read", () => {
    expect(
      stageReadNotice(
        { outcome: "read", rows: [], bound: null },
        "Read just now",
        retry,
      ),
    ).toBeNull();
  });
});

describe("the deletion vocabulary", () => {
  it("never calls a Harness deletion a removal", () => {
    const codes = [
      "not-configured",
      "no-usable-origin",
      "invalid-skill",
      "push-elsewhere",
      "no-answer",
      "source-changed",
      "promote-in-progress",
      "promote-failed",
      "extra-requests",
      "proposed-by-other",
      "confirmation-stale",
      "not-deleted",
      "sparse-checkout",
      "merge-in-progress",
      "rebase-in-progress",
      "unresolved-conflicts",
      "unreadable",
      "a-code-this-build-predates",
    ];
    for (const code of codes) {
      const each = notice(deletionNotice, code);
      const words = `${each?.label} ${each?.message} ${each?.detail ?? ""}`;
      expect(words, code).not.toMatch(/remov/i);
    }
  });
});

describe("CONCURRENT_CHANGE_NOTICE", () => {
  it("carries the promote table's words at info level", () => {
    expect(CONCURRENT_CHANGE_NOTICE).toEqual({
      ...CONCURRENT_CHANGE,
      level: "info",
    });
  });
});

describe("releasePublishedNotice", () => {
  const reread = () => {};

  // A full publish is a toast; only the half outcome stays in the band, because
  // it needs an action. The tag is atomic, so only the Inventory read fails (#849).
  it("warns that the Inventory was not read after the tag was pushed", () => {
    expect(readNotice(releasePublishedNotice("v1.5.0", reread))).toEqual({
      level: "warning",
      label: "Release published",
      message:
        "Maestro tagged v1.5.0, but Inventory was not read. Select Re-read Inventory to see the published skills.",
      detail: "A release cannot change after publication.",
      action: { label: "Re-read Inventory", onClick: reread },
    });
  });

  it("sets the tag apart", () => {
    const notice = releasePublishedNotice("v1.5.0", reread);

    expect(machineValues(notice.message)).toEqual(["v1.5.0"]);
  });
});

describe("skillRestoredNotice", () => {
  const retry = () => {};

  // A full restore is a toast; only a status the cockpit could not read again
  // stays in the band, with the way back to it (#915).
  it("warns that the status is out of date after the folder came back", () => {
    expect(skillRestoredNotice(false, retry)).toEqual({
      level: "warning",
      label: "Skill restored",
      message:
        "The skill folder is back, but the status is out of date. Select Re-read Harness to read GitHub again.",
      detail: "Maestro could not read GitHub after the restore.",
      action: { label: "Re-read Harness", onClick: retry },
    });
  });

  it("says the open proposal is untouched", () => {
    expect(skillRestoredNotice(true, retry)).toEqual({
      level: "warning",
      label: "Skill restored",
      message:
        "The skill folder is back, but the status is out of date. Select Re-read Harness to read GitHub again.",
      detail: "Your proposal remains unchanged.",
      action: { label: "Re-read Harness", onClick: retry },
    });
  });
});

describe("localEditsRefusal", () => {
  it.each([
    [
      "not-configured",
      "Select Change Harness location in Settings, then select Import local edits again.",
    ],
    [
      "destination-unsafe",
      "Nothing was copied. Make the clone's skills folder a real folder inside it, then select Import local edits again.",
    ],
    [
      "source-unreadable",
      "Nothing was copied. Make the folder readable, then select Import local edits again.",
    ],
    [
      "outside-root",
      "Maestro reads only inside your home folder, and this copy is outside it. Copy the changed files into the Harness clone yourself.",
    ],
    [
      "deployed-copy",
      "Deployed by another Harness. Make the change in that Harness.",
    ],
    [
      "origin-unproven",
      "The deployment record does not name this copy's Harness. Copy the changed files into the Harness clone yourself.",
    ],
    [
      "missing-manifest",
      "This copy has no SKILL.md. Put it back, then select Import local edits again.",
    ],
    [
      "invalid-frontmatter",
      "Fix the SKILL.md frontmatter, then select Import local edits again.",
    ],
    [
      "empty-description",
      "Fill in the description in SKILL.md, then select Import local edits again.",
    ],
    [
      "harness-copy-uncommitted",
      "The Harness clone has uncommitted changes to this skill. Undo them, or select Propose change, merge on GitHub and pull first.",
    ],
    [
      "harness-unreadable",
      "Nothing was copied. Make the Harness clone readable, then select Import local edits again.",
    ],
    [
      "nothing-to-carry-back",
      "The Harness already has these changes. See the skill on the Harness screen.",
    ],
    [
      "invalid-name",
      "The deployment record gives this skill a name the Harness cannot use. Copy the changed files into the Harness clone yourself.",
    ],
    [
      "name-taken",
      "The Harness already holds a skill under this name. Copy the changed files into the Harness clone yourself.",
    ],
    [
      "not-found",
      "Nothing was copied. The deployed folder is gone. Select Close, then Import local edits again.",
    ],
    [
      "not-a-directory",
      "Nothing was copied. The deployed copy is no longer a folder. Select Close, then Import local edits again.",
    ],
    [
      "destination-exists",
      "The Harness already holds a folder under this name. Copy the changed files into the Harness clone yourself.",
    ],
    [
      "unsafe-link",
      "Nothing was copied. Replace the symbolic link in the skill folder with a real file, then select Import local edits again.",
    ],
    [
      "hard-linked-file",
      "Nothing was copied. Replace the shared file in the skill folder with a plain copy, then select Import local edits again.",
    ],
    [
      "special-file",
      "Nothing was copied. Take the special file out of the skill folder, then select Import local edits again.",
    ],
    [
      "too-many-files",
      "Nothing was copied. This copy holds over 1,000 files. Remove the files the skill does not need, then select Import local edits again.",
    ],
    [
      "too-large",
      "Nothing was copied. This copy is over 50 MiB. Remove the files the skill does not need, then select Import local edits again.",
    ],
    [
      "source-changed",
      "The skill was not imported. Let the folder change finish, then select Import local edits again.",
    ],
    [
      "copy-failed",
      "The skill was not imported. Free up disk space, then select Import local edits again.",
    ],
    [
      "not-an-update",
      "The deployment record does not list this folder, so Maestro cannot tell which skill it updates. Copy the changed files into the Harness clone yourself.",
    ],
    [
      "unverified",
      "Maestro holds no record of this copy's deployed files. Copy the changed files into the Harness clone yourself.",
    ],
    [
      "copies-differ",
      "The Claude Code and Codex copies differ. Select Import skill on the Harness screen and choose one.",
    ],
    [
      "no-local-edits",
      "No local edits left in this copy. Nothing was imported.",
    ],
    [
      "undoes-newer-changes",
      "The Harness changed this skill after the check, so it was not imported. Select Import local edits again to choose whether to undo that change.",
    ],
  ] as const)("states %s as its reason and next step", (refusal, sentence) => {
    expect(localEditsRefusal({ refusal })).toBe(sentence);
  });

  it("names both folders where the Claude Code and Codex copies differ", () => {
    expect(
      localEditsRefusal({
        refusal: "copies-differ",
        folders: {
          claude: "~/.claude/skills/tdd",
          codex: "~/.agents/skills/tdd",
        },
      }),
    ).toBe(
      "The Claude Code and Codex copies differ. Select Import skill on the Harness screen and choose one: ~/.claude/skills/tdd or ~/.agents/skills/tdd.",
    );
  });
});
