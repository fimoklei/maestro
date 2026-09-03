import { describe, expect, it } from "vitest";
import { HttpError } from "../api/http";
import type { NoticeContent } from "../ui/notice";
import {
  CONCURRENT_CHANGE_NOTICE,
  harnessStateNotice,
  importNotice,
  promoteNotice,
  publishReleaseNotice,
  refreshNotice,
  releasePlanNotice,
  removalNotice,
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
  detail: "Releases are published as tags, fetched over https or ssh.",
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
  detail: "Maestro publishes only to the origin it fetches from.",
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
        "The Maestro server did not answer, so the Harness is as it was. Press Refresh again.",
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
          label: "No answer from GitHub",
          message: "Press Refresh, then Plan release again.",
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
          label: "No answer from GitHub",
          message:
            "Nothing was published. Press Refresh, then Publish release again.",
        },
      ],
      [
        "already-released",
        {
          level: "error",
          label: "Version number taken",
          message:
            "Maestro rebuilt the plan against the newest release. Check it, then Publish release.",
        },
      ],
      [
        "plan-changed",
        {
          level: "error",
          label: "Plan out of date",
          message:
            "Nothing was published. Maestro rebuilt the plan, so check it, then Publish release.",
          detail: "GitHub moved while this dialog was open.",
        },
      ],
      [
        "publish-failed",
        {
          level: "error",
          label: "Tag not pushed",
          message:
            "The Harness is as it was. Publish release again once GitHub is reachable.",
        },
      ],
      [
        "publish-in-progress",
        {
          level: "error",
          label: "Release already running",
          message: "Wait for that release to finish, then Plan release again.",
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
          label: "No answer from GitHub",
          message:
            "Nothing was pushed. Press Refresh, then Propose change again.",
        },
      ],
      [
        "skill-missing",
        {
          level: "error",
          label: "Skill no longer in the Harness",
          message: "Nothing was pushed. Press Refresh to repaint the list.",
        },
      ],
      [
        "source-changed",
        {
          level: "error",
          label: "Folder edit mid-read",
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
    "removalNotice",
    removalNotice,
    {
      level: "error",
      label: "Removal not proposed",
      message:
        "The Maestro server did not answer, and nothing was pushed. Remove skill again.",
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
          label: "No answer from GitHub",
          message:
            "Nothing was pushed. Press Refresh, then Remove skill again.",
        },
      ],
      [
        "source-changed",
        {
          level: "error",
          label: "Folder edit mid-read",
          message: "Nothing was pushed. Press Refresh to repaint the list.",
        },
      ],
      [
        "promote-in-progress",
        {
          level: "error",
          label: "Change already being proposed",
          message: "Wait for that change to finish, then Remove skill again.",
          detail: "Maestro proposes one change at a time.",
        },
      ],
      [
        "promote-failed",
        {
          level: "error",
          label: "Removal not proposed",
          message:
            "The Harness is as it was. Remove skill again once GitHub is reachable.",
        },
      ],
      [
        "confirmation-stale",
        {
          level: "error",
          label: "Confirmation out of date",
          message:
            "Nothing was pushed. Press Refresh, then Remove skill again.",
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
            "A removal publishes what the Harness working tree already says.",
        },
      ],
      [
        "sparse-checkout",
        {
          level: "error",
          label: "Partial clone",
          message:
            "Nothing was pushed. Connect a complete clone to remove skills.",
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
            "Nothing was pushed. Finish or abort the merge, then Remove skill again.",
          detail: "A half-merged working tree does not state what should go.",
        },
      ],
      [
        "rebase-in-progress",
        {
          level: "error",
          label: "Unfinished rebase",
          message:
            "Nothing was pushed. Finish or abort the rebase, then Remove skill again.",
          detail: "A half-rebased working tree does not state what should go.",
        },
      ],
      [
        "unresolved-conflicts",
        {
          level: "error",
          label: "Unresolved conflicts",
          message:
            "Nothing was pushed. Resolve the conflicts, then Remove skill again.",
          detail: "A conflicted working tree does not state what should go.",
        },
      ],
      [
        "unreadable",
        {
          level: "error",
          label: "Unreadable working tree",
          message:
            "Nothing was pushed. Make the Harness folder readable, then Remove skill again.",
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
            "Press Change folder, then pick a folder you wrote yourself.",
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
        "nothing-to-carry-back",
        {
          level: "info",
          label: "Nothing to carry back",
          message:
            "This folder matches the skill the Harness holds. Press Close.",
          detail: "Only a changed file can be carried back.",
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

describe("CONCURRENT_CHANGE_NOTICE", () => {
  it("carries the promote table's words at info level", () => {
    expect(CONCURRENT_CHANGE_NOTICE).toEqual({
      ...CONCURRENT_CHANGE,
      level: "info",
    });
  });
});
