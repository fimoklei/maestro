import type {
  DeleteLocalError,
  DiscardChangeError,
  HarnessPrimitiveType,
  HarnessStateError,
  ImportSkillError,
  LocalEditsRefusal,
  PromoteDeletionError,
  PromoteError,
  ProposalActionError,
  PublishReleaseError,
  ReleasePlanError,
  RestoreError,
  WithdrawError,
  WithdrawFromReleaseError,
} from "@maestro/core";
import { describe, expect, it } from "vitest";
import { HttpError } from "../api/http";
import { machineValues, readNotice, unselectedControls } from "../test-utils";
import type { NoticeContent } from "../ui/notice";
import { plainText } from "../ui/phrase";
import { localDeletionNotice } from "./local-deletion-copy";
import {
  CONCURRENT_CHANGE_NOTICE,
  deletionNotice,
  discardNotice,
  harnessStateNotice,
  importNotice,
  localEditsRefusal,
  openProposalCause,
  promoteNotice,
  proposalNotice,
  publishReleaseNotice,
  refreshNotice,
  releasePlanNotice,
  releasePublishedNotice,
  releaseWithdrawalNotice,
  restoredNotice,
  restoreNotice,
  stageReadNotice,
  staleStatusNotice,
} from "./notice-copy";
import { withdrawNotice } from "./withdraw-notice-copy";

// Contract tests: the words live once, in the copy module and the flow test
// that renders them. These prove the rules every row keeps.

// A Record so a code the server can send, or one it no longer sends, fails the
// typecheck until the list matches the core union.
const codes = <Code extends string>(all: Record<Code, true>) =>
  // Object.keys widens each key to string; the Record holds only Codes.
  Object.keys(all) as Code[];

const HARNESS_STATE = codes<HarnessStateError>({
  "not-configured": true,
  "no-usable-origin": true,
});

const UNKNOWN_CODE = "a-code-this-build-predates";

const refusal = (code: string) => new HttpError(422, "", code);

type Surface = {
  name: string;
  read: (error: unknown) => NoticeContent | null;
  codes: readonly string[];
  // Codes that refuse nothing: the folder is right, there is just nothing in
  // it to carry back (#733).
  info?: readonly string[];
};

const TYPES: readonly HarnessPrimitiveType[] = ["skill", "prompt"];

// One surface per type: each type's notices keep every rule below.
const byType = (
  name: string,
  read: (error: unknown, type: HarnessPrimitiveType) => NoticeContent | null,
  surfaceCodes: readonly string[],
): Surface[] =>
  TYPES.map((type) => ({
    name: `${name} for ${type}`,
    read: (error: unknown) => read(error, type),
    codes: surfaceCodes,
  }));

const SURFACES: Surface[] = [
  {
    name: "harnessStateNotice",
    read: harnessStateNotice,
    codes: HARNESS_STATE,
  },
  { name: "refreshNotice", read: refreshNotice, codes: HARNESS_STATE },
  {
    name: "releasePlanNotice",
    read: releasePlanNotice,
    codes: codes<ReleasePlanError>({
      "not-configured": true,
      "no-usable-origin": true,
      "no-answer": true,
    }),
  },
  {
    name: "publishReleaseNotice",
    read: publishReleaseNotice,
    codes: codes<PublishReleaseError>({
      "not-configured": true,
      "no-usable-origin": true,
      "no-answer": true,
      "empty-delta": true,
      "root-skill-file": true,
      "already-released": true,
      "plan-changed": true,
      "publish-failed": true,
      "publish-in-progress": true,
    }),
  },
  ...byType(
    "promoteNotice",
    promoteNotice,
    codes<PromoteError>({
      "not-configured": true,
      "no-usable-origin": true,
      "invalid-skill": true,
      "no-answer": true,
      "skill-missing": true,
      "destination-unsafe": true,
      "push-elsewhere": true,
      "source-changed": true,
      "concurrent-change": true,
      "extra-requests": true,
      "proposed-by-other": true,
      "promote-failed": true,
      "promote-in-progress": true,
    }),
  ),
  ...byType(
    "deletionNotice",
    deletionNotice,
    codes<PromoteDeletionError>({
      "not-configured": true,
      "no-usable-origin": true,
      "invalid-skill": true,
      "no-answer": true,
      "confirmation-stale": true,
      "not-deleted": true,
      "sparse-checkout": true,
      "merge-in-progress": true,
      "rebase-in-progress": true,
      "unresolved-conflicts": true,
      unreadable: true,
      "push-elsewhere": true,
      "source-changed": true,
      "extra-requests": true,
      "proposed-by-other": true,
      "promote-failed": true,
      "promote-in-progress": true,
    }),
  ),
  ...(
    [
      ["harness", "skill"],
      ["skills", "skill"],
      ["harness", "prompt"],
      ["prompts", "prompt"],
    ] as const
  ).map(([screen, type]) => ({
    name: `localDeletionNotice on ${screen} for ${type}`,
    read: (error: unknown) =>
      localDeletionNotice(error, { type, name: "tdd", screen }),
    codes: codes<DeleteLocalError>({
      "not-configured": true,
      "invalid-skill": true,
      "already-gone": true,
      "no-answer": true,
      "confirmation-stale": true,
      "destination-unsafe": true,
      "destination-unreadable": true,
      "delete-failed": true,
      "delete-in-progress": true,
    }),
  })),
  {
    name: "importNotice",
    read: importNotice,
    codes: codes<ImportSkillError>({
      "not-configured": true,
      "source-unreadable": true,
      "outside-root": true,
      "deployed-copy": true,
      "origin-unproven": true,
      "missing-manifest": true,
      "invalid-frontmatter": true,
      "empty-description": true,
      "invalid-name": true,
      "name-taken": true,
      "not-found": true,
      "not-a-directory": true,
      "destination-exists": true,
      "unsafe-link": true,
      "hard-linked-file": true,
      "special-file": true,
      "too-many-files": true,
      "too-large": true,
      "source-changed": true,
      "copy-failed": true,
      "destination-unsafe": true,
      "harness-copy-uncommitted": true,
      "harness-unreadable": true,
      "nothing-to-carry-back": true,
    }),
    info: ["nothing-to-carry-back"],
  },
  {
    name: "proposalNotice",
    read: proposalNotice,
    codes: codes<ProposalActionError>({
      "not-configured": true,
      "no-usable-origin": true,
      "invalid-skill": true,
      "no-answer": true,
      "review-unavailable": true,
      "review-unknown": true,
      "request-gone": true,
      "extra-requests": true,
      "request-exists": true,
      "proposed-by-other": true,
      "action-failed": true,
    }),
  },
  ...byType(
    "restoreNotice",
    restoreNotice,
    codes<RestoreError>({
      "not-configured": true,
      "invalid-skill": true,
      "head-moved": true,
      "staged-changes": true,
      "not-in-commit": true,
      "destination-exists": true,
      "destination-unsafe": true,
      "destination-unreadable": true,
      "source-unreadable": true,
      "sparse-checkout": true,
      "merge-in-progress": true,
      "rebase-in-progress": true,
      "unresolved-conflicts": true,
      unreadable: true,
      "restore-in-progress": true,
      "restore-failed": true,
    }),
  ),
  ...byType(
    "withdrawNotice",
    (error, type) =>
      withdrawNotice(error, {
        type,
        name: "tdd",
        branch: "maestro/tdd",
        defaultBranch: "main",
        number: 45,
      }),
    codes<WithdrawError>({
      "not-configured": true,
      "no-usable-origin": true,
      "invalid-skill": true,
      "no-answer": true,
      "review-unavailable": true,
      "review-unknown": true,
      "request-gone": true,
      "extra-requests": true,
      "request-exists": true,
      "proposed-by-other": true,
      "action-failed": true,
      "push-elsewhere": true,
      "sparse-checkout": true,
      "merge-in-progress": true,
      "rebase-in-progress": true,
      "unresolved-conflicts": true,
      unreadable: true,
      "destination-unsafe": true,
      "destination-unreadable": true,
      "withdraw-in-progress": true,
      "replace-failed": true,
      "close-failed": true,
      "branch-delete-failed": true,
      "branch-by-other": true,
      "commit-email-missing": true,
      "branch-authors-unknown": true,
    }),
  ),
  ...byType(
    "discardNotice",
    (error, type) => discardNotice(error, { type, name: "tdd" }),
    codes<DiscardChangeError>({
      "not-configured": true,
      "invalid-skill": true,
      "sparse-checkout": true,
      "merge-in-progress": true,
      "rebase-in-progress": true,
      "unresolved-conflicts": true,
      unreadable: true,
      "no-answer": true,
      "already-proposed": true,
      "nothing-to-discard": true,
      "confirmation-stale": true,
      "destination-unsafe": true,
      "destination-unreadable": true,
      "discard-in-progress": true,
      "discard-failed": true,
    }),
  ),
  ...byType(
    "releaseWithdrawalNotice",
    (error, type) =>
      releaseWithdrawalNotice(error, { type, name: "tdd", openRequests: null }),
    codes<WithdrawFromReleaseError>({
      "not-configured": true,
      "invalid-skill": true,
      "sparse-checkout": true,
      "merge-in-progress": true,
      "rebase-in-progress": true,
      "unresolved-conflicts": true,
      unreadable: true,
      "no-answer": true,
      "not-pending-release": true,
      "proposal-open": true,
      "confirmation-stale": true,
      "destination-unsafe": true,
      "destination-unreadable": true,
      "withdraw-in-progress": true,
      "withdraw-failed": true,
    }),
  ),
];

const surface = (name: string) => {
  const found = SURFACES.find((each) => each.name === name);
  if (found === undefined) throw new Error(`No surface ${name}`);
  return found;
};

// Every notice a surface can show: one per code, then its fallback.
const noticesOf = ({ read, codes }: Surface) =>
  [...codes, UNKNOWN_CODE].map(
    (code) => [code, readNotice(read(refusal(code)))] as const,
  );

const wordsOf = (notice: ReturnType<typeof readNotice<NoticeContent>>) =>
  `${notice?.label} ${notice?.message} ${notice?.detail ?? ""}`;

describe.each(SURFACES)("$name", (each) => {
  const fallback = readNotice(each.read(refusal(UNKNOWN_CODE)));

  it("has its own notice for every server code", () => {
    for (const code of each.codes) {
      expect(readNotice(each.read(refusal(code))), code).not.toEqual(fallback);
    }
  });

  it("states a server failure no row covers as an error", () => {
    expect(fallback?.level).toBe("error");
    expect(fallback?.message).toMatch(/The Maestro server did not answer/);
  });

  it("states every refusal as an error", () => {
    for (const [code, notice] of noticesOf(each)) {
      const level = each.info?.includes(code) ? "info" : "error";
      expect(notice?.level, code).toBe(level);
    }
  });

  it("names every control it points to as select {Control}", () => {
    for (const [code, notice] of noticesOf(each)) {
      expect(unselectedControls(notice?.message ?? ""), code).toEqual([]);
      expect(unselectedControls(notice?.detail ?? ""), code).toEqual([]);
    }
  });

  it("shows nothing without an error", () => {
    expect(each.read(null)).toBeNull();
  });
});

describe("the fallbacks", () => {
  // One fallback per surface: each failure costs something different (#688).
  it("state a different cost on every surface", () => {
    const messages = SURFACES.filter(
      ({ name }) =>
        !name.endsWith(" for prompt") &&
        name !== "localDeletionNotice on skills for skill",
    ).map(({ read }) => readNotice(read(refusal(UNKNOWN_CODE)))?.message);

    expect(new Set(messages).size).toBe(messages.length);
  });
});

describe("a refusal that left the working tree as it was", () => {
  // Every sentence opens by saying so (#915).
  it.each(
    TYPES.flatMap((type) => [
      [`restoreNotice for ${type}`, "Nothing was restored."],
      [`discardNotice for ${type}`, "Nothing was discarded."],
      [`releaseWithdrawalNotice for ${type}`, "Nothing was withdrawn."],
    ]),
  )("%s opens every sentence with %j", (name, opening) => {
    for (const [code, notice] of noticesOf(surface(name))) {
      expect(notice?.message.startsWith(`${opening} `), code).toBe(true);
    }
  });
});

describe("the refused skill", () => {
  it.each(
    TYPES.flatMap((type) => [
      [`discardNotice for ${type}`, ["already-proposed", "nothing-to-discard"]],
      [`releaseWithdrawalNotice for ${type}`, ["not-pending-release"]],
      [
        `localDeletionNotice on harness for ${type}`,
        ["already-gone", "confirmation-stale"],
      ],
    ]),
  )("%s names it where the detail speaks of it", (name, named) => {
    for (const code of named) {
      expect(surface(name).read(refusal(code))?.detail, code).toSatisfy(
        (detail: NoticeContent["detail"]) =>
          detail !== undefined && plainText(detail).includes("tdd"),
      );
    }
  });
});

describe("Delete skill on each screen", () => {
  // Each screen names its own control that shows the skill as it is now.
  it("sends a folder already gone to that screen's way back", () => {
    const gone = (screen: "harness" | "skills") =>
      localDeletionNotice(refusal("already-gone"), {
        type: "skill",
        name: "tdd",
        screen,
      })?.message;

    expect(gone("harness")).toBe(
      "Select Re-read Harness to see the skill as it is now.",
    );
    expect(gone("skills")).toBe(
      "Select Harness to see the skill as it is now.",
    );
  });
});

describe("the deletion vocabulary", () => {
  it("never calls a Harness deletion a removal", () => {
    for (const type of TYPES) {
      for (const [code, notice] of noticesOf(
        surface(`deletionNotice for ${type}`),
      )) {
        expect(wordsOf(notice), code).not.toMatch(/remov/i);
      }
    }
  });
});

describe("proposalNotice", () => {
  // Create, reopen and withdraw share one table, so no row names one action's
  // button.
  it("names none of the actions that share it", () => {
    for (const [code, notice] of noticesOf(surface("proposalNotice"))) {
      expect(wordsOf(notice), code).not.toMatch(
        /Create pull request|Reopen proposal|Withdraw proposal/,
      );
    }
  });
});

describe("CONCURRENT_CHANGE_NOTICE", () => {
  // A way through, not a cost: pulling the teammate's change is the only way
  // (#465).
  it("carries the promote refusal's words at info level", () => {
    expect(CONCURRENT_CHANGE_NOTICE).toEqual({
      ...promoteNotice(refusal("concurrent-change"), "skill"),
      level: "info",
    });
  });
});

describe("staleStatusNotice", () => {
  const retry = () => {};
  const READ_AT = "2026-08-03T11:56:00.000Z";
  const stale = (outcome: "offline" | "fetch-failed") =>
    staleStatusNotice({ outcome, lastFetchedAt: READ_AT }, retry);

  it("warns, with Re-read Harness as its action, when a fetch failed over an earlier read", () => {
    expect(stale("fetch-failed")).toMatchObject({
      level: "warning",
      action: { label: "Re-read Harness", onClick: retry },
    });
  });

  it("names being offline as a different cause from a fetch with no answer", () => {
    expect(stale("offline")?.detail).not.toEqual(stale("fetch-failed")?.detail);
    expect(stale("offline")).toEqual({
      ...stale("fetch-failed"),
      detail: stale("offline")?.detail,
    });
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

  it.each([
    ["unavailable", "review-unavailable"],
    ["unknown", "review-unknown"],
  ] as const)(
    "warns about a stage read %s in the words of %s",
    (outcome, code) => {
      const cause = proposalNotice(refusal(code));

      expect(stageReadNotice({ outcome }, "Stage label", retry)).toEqual({
        level: "warning",
        label: "Stage label",
        message: cause?.message,
        detail: cause?.detail,
        action: { label: "Re-read Harness", onClick: retry },
      });
    },
  );

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

describe("releasePublishedNotice", () => {
  const reread = () => {};

  // A full publish is a toast; only the half outcome stays in the band, because
  // it needs an action. The tag is atomic, so only the Inventory read fails (#849).
  it("warns with Re-read Skills as its action", () => {
    expect(releasePublishedNotice("v1.5.0", reread)).toMatchObject({
      level: "warning",
      action: { label: "Re-read Skills", onClick: reread },
    });
  });

  it("sets the tag apart", () => {
    const notice = releasePublishedNotice("v1.5.0", reread);

    expect(machineValues(notice.message)).toEqual(["v1.5.0"]);
  });
});

describe("restoredNotice", () => {
  const retry = () => {};

  // A full restore is a toast; only a status the cockpit could not read again
  // stays in the band, with the way back to it (#915).
  it("warns with Re-read Harness as its action", () => {
    expect(restoredNotice("skill", false, retry)).toMatchObject({
      level: "warning",
      action: { label: "Re-read Harness", onClick: retry },
    });
  });

  it("says something different where a proposal is open", () => {
    const withRequest = restoredNotice("skill", true, retry);
    const without = restoredNotice("skill", false, retry);

    expect(withRequest.detail).not.toEqual(without.detail);
    expect(withRequest).toEqual({ ...without, detail: withRequest.detail });
  });
});

describe("localEditsRefusal", () => {
  const REFUSALS = codes<LocalEditsRefusal>({
    "not-configured": true,
    "destination-unsafe": true,
    "source-unreadable": true,
    "outside-root": true,
    "deployed-copy": true,
    "origin-unproven": true,
    "missing-manifest": true,
    "invalid-frontmatter": true,
    "empty-description": true,
    "harness-copy-uncommitted": true,
    "harness-unreadable": true,
    "nothing-to-carry-back": true,
    "invalid-name": true,
    "name-taken": true,
    "not-found": true,
    "not-a-directory": true,
    "destination-exists": true,
    "unsafe-link": true,
    "hard-linked-file": true,
    "special-file": true,
    "too-many-files": true,
    "too-large": true,
    "source-changed": true,
    "copy-failed": true,
    "not-an-update": true,
    unverified: true,
    "copies-differ": true,
    "no-local-edits": true,
    "undoes-newer-changes": true,
  });

  it("states every refusal as a sentence of its own", () => {
    const sentences = REFUSALS.map((refusal) => localEditsRefusal({ refusal }));

    expect(sentences.every((each) => each.endsWith("."))).toBe(true);
    expect(new Set(sentences).size).toBe(sentences.length);
  });

  it("names every control it points to as select {Control}", () => {
    for (const refusal of REFUSALS) {
      expect(
        unselectedControls(localEditsRefusal({ refusal })),
        refusal,
      ).toEqual([]);
    }
  });

  it("names both folders where the Claude Code and Codex copies differ", () => {
    const sentence = localEditsRefusal({
      refusal: "copies-differ",
      folders: {
        claude: "~/.claude/skills/tdd",
        codex: "~/.agents/skills/tdd",
      },
    });

    expect(sentence).toContain("~/.claude/skills/tdd");
    expect(sentence).toContain("~/.agents/skills/tdd");
  });
});

describe("a prompt's notices", () => {
  const promptSurfaces = SURFACES.filter(({ name }) =>
    name.endsWith(" for prompt"),
  );

  // A prompt is one file: no sentence may send its reader to a skill or to a
  // folder of its own (#1590).
  it.each(promptSurfaces.map(({ name }) => [name]))(
    "%s never says skill, and no folder but the Harness or prompts folder",
    (name) => {
      for (const [code, notice] of noticesOf(surface(name))) {
        expect(wordsOf(notice), code).not.toMatch(
          /skill|(?<!prompts |Harness )folder/i,
        );
      }
    },
  );

  it("names the prompt name rule with a prompt example", () => {
    expect(
      readNotice(promoteNotice(refusal("invalid-skill"), "prompt")),
    ).toMatchObject({
      label: "Unusable prompt name",
      message:
        "A prompt name uses lowercase letters, digits and single hyphens, like pr-review.",
    });
  });

  it("states a file deleted from the clone after the dialog opened", () => {
    expect(
      readNotice(
        localDeletionNotice(refusal("already-gone"), {
          type: "prompt",
          name: "pr-review",
          screen: "prompts",
        }),
      ),
    ).toMatchObject({
      label: "File already deleted",
      message: "Select Harness to see the prompt as it is now.",
      detail:
        "Something removed the pr-review file from your clone after this dialog opened.",
    });
  });

  it("asks for Delete prompt again once the clone is read", () => {
    expect(
      readNotice(
        localDeletionNotice(refusal("no-answer"), {
          type: "prompt",
          name: "pr-review",
          screen: "harness",
        }),
      )?.message,
    ).toBe(
      "Nothing was deleted. Select Close, then select Delete prompt again.",
    );
  });

  it("states a prompt file that is a link", () => {
    expect(
      readNotice(restoreNotice(refusal("destination-unsafe"), "prompt")),
    ).toMatchObject({
      label: "Link in the Harness",
      message:
        "Nothing was restored. Replace the link with a real file, then select Restore prompt again.",
      detail:
        "The prompt file or the Harness .maestro/prompts folder is a link.",
    });
  });

  it.each([
    [
      "prompt",
      "Nothing was pushed. Replace the link with a real file, then select Propose change again.",
      "The prompt file or the Harness .maestro/prompts folder is a link.",
    ],
    [
      "skill",
      "Nothing was pushed. Replace the link with a real folder, then select Propose change again.",
      "The skill folder or the Harness .apm/skills folder is a link.",
    ],
  ] as const)(
    "states a %s that is a link, pushing nothing",
    (type, message, detail) => {
      expect(
        readNotice(promoteNotice(refusal("destination-unsafe"), type)),
      ).toMatchObject({ label: "Link in the Harness", message, detail });
    },
  );

  it("states a skill folder that is a link, discarding nothing", () => {
    expect(
      readNotice(
        discardNotice(refusal("destination-unsafe"), {
          type: "skill",
          name: "tdd",
        }),
      ),
    ).toMatchObject({
      label: "Link in the Harness",
      detail: "The skill folder or the Harness .apm/skills folder is a link.",
    });
  });

  it("states a skills folder that cannot be read, deleting nothing", () => {
    expect(
      readNotice(
        localDeletionNotice(refusal("destination-unreadable"), {
          type: "skill",
          name: "tdd",
          screen: "harness",
        }),
      ),
    ).toEqual({
      level: "error",
      label: "Skills folder not read",
      message:
        "Nothing was deleted. Make the Harness .apm/skills folder readable, then select Delete skill again.",
    });
  });

  it("states a prompts folder that cannot be read, discarding nothing", () => {
    expect(
      readNotice(
        discardNotice(refusal("destination-unreadable"), {
          type: "prompt",
          name: "pr-review",
        }),
      ),
    ).toEqual({
      level: "error",
      label: "Prompts folder not read",
      message:
        "Nothing was discarded. Make the Harness .maestro/prompts folder readable, then select Discard change again.",
    });
  });

  it("states a restored prompt whose status is out of date", () => {
    expect(restoredNotice("prompt", false, () => {})).toMatchObject({
      label: "Prompt restored",
      message:
        "The prompt file is back, but the status is out of date. Select Re-read Harness to read GitHub again.",
    });
  });
});

describe("withdrawal notices without an open pull request (#1639)", () => {
  const notice = (error: string) =>
    readNotice(
      withdrawNotice(refusal(error), {
        type: "skill",
        name: "tdd",
        branch: "maestro/tdd",
        defaultBranch: "main",
        number: null,
      }),
    );

  it("names the commits of another author", () => {
    expect(notice("branch-by-other")).toMatchObject({
      label: "Another contributor's commits",
      message:
        "Only their author can withdraw the proposal. Select Re-read Harness to read GitHub again.",
      detail: "A commit on the proposal branch has another author email.",
    });
  });

  it("asks for a git email where the clone has none", () => {
    const read = notice("commit-email-missing");
    expect(read).toMatchObject({
      label: "Git email not set",
      message:
        "Set user.email in your clone, then select Withdraw proposal again.",
    });
    expect(read?.detail).toBeUndefined();
  });

  it("sends the reader to a re-read where the authors could not be read", () => {
    expect(notice("branch-authors-unknown")).toMatchObject({
      label: "Branch authors not checked",
      message: "Select Re-read Harness, then select Withdraw proposal again.",
      detail:
        "Maestro could not compare the proposal branch's commit authors with user.email.",
    });
  });

  it("names no pull request where a step failed", () => {
    expect(notice("replace-failed")?.detail).toBe(
      "The proposal branch remains unchanged.",
    );
    expect(notice("branch-delete-failed")?.detail).toBe(
      "Your skill folder matches its copy on main.",
    );
  });
});

describe("Withdraw from release while a proposal is open", () => {
  it("names the one pull request to merge", () => {
    expect(openProposalCause([52])).toBe(
      "Merge pull request #52 on GitHub, or select Withdraw proposal.",
    );
  });

  it("names every pull request to merge", () => {
    expect(openProposalCause([45, 51, 52])).toBe(
      "Merge pull requests #45, #51 and #52 on GitHub, or select Withdraw proposal.",
    );
  });

  it("sends an unknown read to Re-read Harness", () => {
    expect(openProposalCause(null)).toBe(
      "Select Re-read Harness to read GitHub again.",
    );
  });

  it("states no cause while no pull request is open", () => {
    expect(openProposalCause([])).toBeNull();
  });

  it("refuses a withdrawal while the pull request read is unknown", () => {
    expect(
      readNotice(
        releaseWithdrawalNotice(refusal("proposal-open"), {
          type: "skill",
          name: "tdd",
          openRequests: null,
        }),
      ),
    ).toEqual({
      level: "error",
      label: "Withdrawal blocked",
      message:
        "Nothing was withdrawn. Select Re-read Harness to read GitHub again.",
      detail:
        "A pull request for this skill is open, or GitHub could not be read.",
    });
  });

  it("refuses a withdrawal by naming the open pull requests to merge", () => {
    expect(
      readNotice(
        releaseWithdrawalNotice(refusal("proposal-open"), {
          type: "skill",
          name: "tdd",
          openRequests: [45, 52],
        }),
      ),
    ).toEqual({
      level: "error",
      label: "Withdrawal blocked",
      message:
        "Nothing was withdrawn. Merge pull requests #45 and #52 on GitHub, or select Withdraw proposal.",
    });
  });
});
