import { describe, expect, it } from "vitest";
import { HttpError } from "../api/http";
import type { NoticeContent } from "../ui/notice";
import {
  CONCURRENT_CHANGE_NOTICE,
  deletionNotice,
  harnessStateNotice,
  importNotice,
  localDeletionNotice,
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

// The finished notice as data: level, heading, sentence, detail (ADR-0025 §10
// rejected a copy linter, so nothing here asserts capitalisation or length).
type Case = [code: string, expected: NoticeContent];

const notice = (
  read: (error: unknown) => NoticeContent | null,
  code: string,
): NoticeContent | null => read(new HttpError(422, "", code));

const NOT_CONFIGURED: NoticeContent = {
  level: "error",
  label: "No Harness connected",
  message: "Set the Harness location on the Inventory source screen.",
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
        "The Maestro server did not answer. Reload the page to read the Harness again.",
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
        "The Maestro server did not answer, so the Harness is as it was. Select Retry check.",
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
          message: "Select Retry check, then Create a release again.",
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
            "Nothing was published. Select Retry check, then Publish release again.",
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
          label: "Release already running",
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
            "Nothing was pushed. Select Retry check, then Propose change again.",
        },
      ],
      [
        "skill-missing",
        {
          level: "error",
          label: "Skill no longer in the Harness",
          message:
            "Nothing was pushed. Select Retry check to repaint the list.",
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
          label: "Change already being proposed",
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
            "Nothing was pushed. Select Retry check, then Delete skill again.",
        },
      ],
      [
        "source-changed",
        {
          level: "error",
          label: "Files changed during the check",
          message:
            "Nothing was pushed. Select Retry check to repaint the list.",
        },
      ],
      [
        "promote-in-progress",
        {
          level: "error",
          label: "Change already being proposed",
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
        "confirmation-stale",
        {
          level: "error",
          label: "Confirmation out of date",
          message:
            "Nothing was pushed. Select Retry check, then Delete skill again.",
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
    localDeletionNotice,
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
          label: "Skill already deleted",
          message:
            "The Harness no longer holds this skill. Select Retry check.",
          detail: "Something removed the folder after this list was read.",
        },
      ],
      [
        "not-local-only",
        {
          level: "error",
          label: "Skill exists elsewhere",
          message:
            "Nothing was deleted. Select Retry check to repaint the list.",
          detail:
            "Maestro found this skill outside the working tree, or could not read the Harness refs.",
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
          label: "Harness already changing",
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
            "Set the Harness location on the Inventory source screen, then Import skill again.",
        },
      ],
      [
        "source-unreadable",
        {
          level: "error",
          label: "Unreadable folder",
          message:
            "Nothing was copied. Make the folder readable, then pick it again.",
        },
      ],
      [
        "outside-root",
        {
          level: "error",
          label: "Folder out of reach",
          message: "Pick a folder inside your home folder.",
          detail: "Maestro reads inside the home folder only.",
        },
      ],
      [
        "missing-manifest",
        {
          level: "error",
          label: "No SKILL.md",
          message: "Pick the folder that holds the skill's SKILL.md.",
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
          message: "Nothing was copied. Pick the folder again.",
        },
      ],
      [
        "not-a-directory",
        {
          level: "error",
          label: "Not a folder",
          message:
            "A skill is a folder with a SKILL.md in it. Pick one of those.",
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
            "Nothing was copied. Pick the skill folder itself, not the repository around it.",
        },
      ],
      [
        "too-large",
        {
          level: "error",
          label: "Over 50 MiB",
          message:
            "Nothing was copied. Pick the skill folder itself, not the repository around it.",
        },
      ],
      [
        "source-changed",
        {
          level: "error",
          label: "Folder edit mid-copy",
          message:
            "Nothing was left in the Harness. Let the edit on disk finish, then Import skill again.",
        },
      ],
      [
        "copy-failed",
        {
          level: "error",
          label: "Unfinished copy",
          message:
            "Nothing was left in the Harness. Free up disk space, then Import skill again.",
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
            "Select Change folder, then pick a folder you wrote yourself.",
          detail:
            "Only a copy the connected Harness deployed can be carried back into it.",
        },
      ],
      [
        "harness-copy-uncommitted",
        {
          level: "error",
          label: "Uncommitted changes in the Harness",
          message:
            "Commit or undo the Harness's own changes to this skill, then Update skill again.",
          detail:
            "Replacing the folder now would take work git has no record of.",
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
          label: "Nothing to carry back",
          message:
            "This folder matches the skill the Harness holds. Select Close.",
          detail: "Only a changed file can be carried back.",
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
    // Every way through names a control the reader can see: the three actions
    // share one table, so no row may name one action's button (copy.md).
    [
      ["not-configured", NOT_CONFIGURED],
      ["invalid-skill", UNUSABLE_NAME],
      [
        "no-answer",
        {
          level: "error",
          label: "GitHub did not respond",
          message: "Nothing changed on GitHub. Select Retry check.",
          detail:
            "Maestro could not read the branch this proposal is opened against.",
        },
      ],
      [
        "review-unavailable",
        {
          level: "error",
          label: "Review status unavailable",
          message: "Sign in with gh auth login, then select Retry check.",
          detail: "Maestro reads pull requests through your own gh sign-in.",
        },
      ],
      [
        "review-unknown",
        {
          level: "error",
          label: "Review status unknown",
          message: "Select Retry check to read GitHub again.",
          detail: "GitHub gave no answer Maestro can act on.",
        },
      ],
      [
        "extra-requests",
        {
          level: "error",
          label: "Multiple pull requests",
          message:
            "Select a View pull request link to close the extras, then select Retry check.",
          detail:
            "More than one open pull request matches this skill's branch.",
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
            "Nothing was restored. Set the Harness location on the Inventory source screen.",
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
            "Nothing was restored. Select Retry check, then Restore skill again.",
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
          label: "Harness already changing",
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
];

describe.each(suites)("%s", (_name, read, fallback, cases) => {
  it.each(cases)("states the whole notice for %s", (code, expected) => {
    expect(notice(read, code)).toEqual(expected);
  });

  it("states its own cost when no row covers the failure", () => {
    expect(notice(read, "a-code-this-build-predates")).toEqual(fallback);
  });

  it("shows nothing without an error", () => {
    expect(read(null)).toBeNull();
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
      message: "Select Retry check to read GitHub again.",
      detail: "GitHub gave no answer, so these rows are from the last read.",
      action: { label: "Retry check", onClick: retry },
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
      message: "Sign in with gh auth login, then select Retry check.",
      detail: "Maestro reads pull requests through your own gh sign-in.",
      action: { label: "Retry check", onClick: retry },
    });
  });

  it("states the whole notice for a stage GitHub gave no answer for", () => {
    expect(
      stageReadNotice({ outcome: "unknown" }, "Status unknown", retry),
    ).toEqual({
      level: "warning",
      label: "Status unknown",
      message: "Select Retry check to read GitHub again.",
      detail: "GitHub gave no answer Maestro can act on.",
      action: { label: "Retry check", onClick: retry },
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
    // Remove belongs to deployed copies alone (CONTEXT.md · Screen names).
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

  it("states the tag and the Inventory read that followed it", () => {
    expect(releasePublishedNotice("v1.5.0", true, reread)).toEqual({
      level: "success",
      label: "Release published",
      message: "Maestro tagged v1.5.0 and refreshed Inventory.",
      detail: "A release cannot change after publication.",
    });
  });

  it("keeps the heading and the detail when only the Inventory read failed", () => {
    // The tag is atomic, so the release stands whatever the re-read did: one
    // heading, one subject, one detail across both outcomes (#849).
    expect(releasePublishedNotice("v1.5.0", false, reread)).toEqual({
      level: "warning",
      label: "Release published",
      message:
        "Maestro tagged v1.5.0 but could not refresh Inventory. Re-read Inventory to see the published skills.",
      detail: "A release cannot change after publication.",
      action: { label: "Re-read Inventory", onClick: reread },
    });
  });
});

describe("skillRestoredNotice", () => {
  const retry = () => {};

  it("states what came back and where it came from", () => {
    expect(skillRestoredNotice(false, true, retry)).toEqual({
      level: "success",
      label: "Skill restored",
      message: "Restored from your last local commit.",
    });
  });

  it("says the open proposal is untouched", () => {
    expect(skillRestoredNotice(true, true, retry)).toEqual({
      level: "success",
      label: "Skill restored",
      message: "Restored from your last local commit.",
      detail: "Your proposal remains unchanged.",
    });
  });

  // The folder is back whatever GitHub said, so the heading holds. Only the
  // status is unknown, and the way back to it rides in the notice (#915).
  it("keeps the heading and warns when the status could not be read again", () => {
    expect(skillRestoredNotice(false, false, retry)).toEqual({
      level: "warning",
      label: "Skill restored",
      message:
        "The skill folder is back, but the status is out of date. Select Retry check to read GitHub again.",
      detail: "Maestro could not read GitHub after the restore.",
      action: { label: "Retry check", onClick: retry },
    });
  });

  it("still says the open proposal is untouched at warning level", () => {
    expect(skillRestoredNotice(true, false, retry)).toEqual({
      level: "warning",
      label: "Skill restored",
      message:
        "The skill folder is back, but the status is out of date. Select Retry check to read GitHub again.",
      detail: "Your proposal remains unchanged.",
      action: { label: "Retry check", onClick: retry },
    });
  });
});
