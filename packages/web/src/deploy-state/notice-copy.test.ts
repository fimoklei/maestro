import type {
  DeploySkillError,
  PendingOperation,
  RemoveDeployedSkillError,
  RemovePreflightError,
  RetryTargetOperationError,
  UpdatePreviewError,
  UpdateRunError,
} from "@maestro/core";
import { describe, expect, it } from "vitest";
import { HttpError } from "../api/http";
import { machineValues, readNotice, unselectedControls } from "../test-utils";
import { plainText } from "../ui/phrase";
import { localEditsCheckNotice } from "./import-local-edits-copy";
import {
  type DeployStateNotice,
  deployNotice,
  deployNoticeFor,
  removeNotice,
  retryNotice,
  updateNotice,
  updatePreviewNotice,
} from "./notice-copy";

// Contract tests: the words live once, in the copy module and the flow test
// that renders them. These prove the rules every row keeps.

// A Record so a code the server can send, or one it no longer sends, fails the
// typecheck until the list matches the core union.
const codes = <Code extends string>(all: Record<Code, true>) =>
  // Object.keys widens each key to string; the Record holds only Codes.
  Object.keys(all) as Code[];

const DEPLOY = codes<DeploySkillError>({
  "unsupported-primitive-type": true,
  "invalid-name": true,
  "unknown-skill": true,
  "inventory-not-configured": true,
  "inventory-unreadable": true,
  "repo-not-registered": true,
  "inventory-origin-unavailable": true,
  "no-published-tag": true,
  "local-diverged-from-tag": true,
  "deployed-diverged-from-lock": true,
  "deployed-unverifiable": true,
  "deployed-unreadable": true,
  "lockfile-malformed": true,
  "deploy-in-progress": true,
  "ref-unresolvable": true,
  "not-at-target-release": true,
  "target-pinned-per-skill": true,
  "manifest-not-recognised": true,
  "operation-unfinished": true,
  "deploy-incomplete": true,
  "no-supported-tool": true,
  "auth-required": true,
  "destination-symlinked": true,
  "deploy-failed": true,
});

const UPDATE_PREVIEW = codes<UpdatePreviewError>({
  "repo-not-registered": true,
  "no-supported-tool": true,
  "not-deployed": true,
  "lockfile-malformed": true,
  "deployed-unreadable": true,
  "inventory-not-configured": true,
  "inventory-unreadable": true,
  "no-published-tag": true,
  "skill-not-in-release": true,
  "inventory-origin-unavailable": true,
  "ref-unresolvable": true,
  "preview-failed": true,
  "destination-symlinked": true,
});

const UPDATE_RUN: UpdateRunError[] = [
  ...UPDATE_PREVIEW,
  ...codes<Exclude<UpdateRunError, UpdatePreviewError>>({
    "status-out-of-date": true,
    "update-in-progress": true,
    "operation-unfinished": true,
    "deployed-diverged-from-lock": true,
    "deployed-unverifiable": true,
    "manifest-not-recognised": true,
    "update-incomplete": true,
    "update-failed": true,
  }),
];

const RETRY = codes<RetryTargetOperationError>({
  "repo-not-registered": true,
  "nothing-to-retry": true,
  "retry-in-progress": true,
  "deployed-diverged-from-lock": true,
  "deployed-unverifiable": true,
  "deployed-unreadable": true,
  "lockfile-malformed": true,
  "manifest-not-recognised": true,
  "retry-incomplete": true,
  "retry-failed": true,
});

const KINDS: PendingOperation["kind"][] = ["deploy", "remove", "update"];
const pending = (kind: PendingOperation["kind"]) =>
  ({ kind, release: "v0.3.4" }) as const;

const refusal = (code: string) => new HttpError(422, "unused", code);

type Surface = {
  name: string;
  read: (error: unknown) => DeployStateNotice;
  codes: readonly string[];
  // A code whose own notice is the surface's fallback: the outcome is as
  // unknown as a failure with no code.
  fallbackCode?: string;
};

const SURFACES: Surface[] = [
  { name: "deployNotice", read: deployNotice, codes: DEPLOY },
  {
    name: "removeNotice",
    read: removeNotice,
    codes: codes<RemoveDeployedSkillError | RemovePreflightError>({
      "unsupported-primitive-type": true,
      "invalid-name": true,
      "repo-not-registered": true,
      "no-supported-tool": true,
      "deployed-diverged-from-lock": true,
      "not-deployed": true,
      "lockfile-malformed": true,
      "ref-unresolvable": true,
      "deployed-unreadable": true,
      "deployed-diverged-pinned-per-skill": true,
      "cost-not-acknowledged": true,
      "remove-in-progress": true,
      "remove-incomplete": true,
      "remove-failed": true,
      "preflight-failed": true,
      "manifest-not-recognised": true,
      "operation-unfinished": true,
    }),
    // "Removal outcome unknown" is both the fallback and remove-failed's label.
    fallbackCode: "remove-failed",
  },
  {
    name: "updatePreviewNotice",
    read: (error) => updatePreviewNotice(error, "Update target"),
    codes: UPDATE_PREVIEW,
  },
  {
    name: "updateNotice",
    read: (error) => updateNotice(error, "Update target"),
    codes: UPDATE_RUN,
  },
  ...KINDS.map((kind) => ({
    name: `retryNotice for a ${kind}`,
    read: (error: unknown) => retryNotice(error, pending(kind)),
    codes: RETRY,
    // A retry that failed proves no more than one that never answered.
    fallbackCode: "retry-failed",
  })),
];

const UNKNOWN_CODE = "a-code-this-build-predates";

// Every notice a surface can show: one per code, then its fallback.
const noticesOf = ({ read, codes }: Surface) =>
  [...codes, UNKNOWN_CODE].map(
    (code) => [code, readNotice(read(refusal(code)))] as const,
  );

describe.each(SURFACES)("$name", (each) => {
  const fallback = readNotice(each.read(refusal(UNKNOWN_CODE)));

  it("has its own notice for every server code", () => {
    for (const code of each.codes) {
      if (code === each.fallbackCode) continue;
      expect(readNotice(each.read(refusal(code))), code).not.toEqual(fallback);
    }
  });

  it("gives every server code a label", () => {
    for (const [code, notice] of noticesOf(each)) {
      expect(notice?.label, code).toMatch(/^[A-Z]/);
    }
  });

  it("states a failure no row covers as an unknown outcome", () => {
    expect(fallback).toEqual(readNotice(each.read(new Error("offline"))));
    expect(fallback?.label).toMatch(/outcome unknown$/);
    expect(fallback?.detail).toBe(
      "A dropped connection, or a failure this version of Maestro does not name.",
    );
  });

  it("names every control it points to as select {Control}", () => {
    for (const [code, notice] of noticesOf(each)) {
      expect(unselectedControls(notice?.message ?? ""), code).toEqual([]);
      expect(unselectedControls(notice?.detail ?? ""), code).toEqual([]);
    }
  });

  // Required return, never the thrown message: an uncovered code would
  // otherwise render the wrapper's own "Request failed with status 422.".
  it("never renders the thrown message", () => {
    const error = new HttpError(
      422,
      "Request failed with status 422.",
      "sunspots",
    );
    expect(JSON.stringify(readNotice(each.read(error)))).not.toContain("422");
  });

  it("keeps the server's request-shape sentence for a malformed request", () => {
    const error = new HttpError(
      400,
      "Maestro could not start this change. Reload the page, then try again.",
      "invalid-body",
      { detail: "The request carries a type, a name and a target." },
    );
    expect(each.read(error)).toEqual({
      label: "Maestro could not start the action",
      message:
        "Maestro could not start this change. Reload the page, then try again.",
      detail: "The request carries a type, a name and a target.",
    });
  });
});

describe("the fallbacks", () => {
  // One fallback per surface: each failure costs something different (#688).
  it("state a different outcome on every surface", () => {
    const labels = [
      deployNotice(new Error("offline")),
      removeNotice(new Error("offline")),
      updatePreviewNotice(new Error("offline"), "Update target"),
      updateNotice(new Error("offline"), "Update target"),
    ].map(({ label }) => label);

    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe("a bulk run's deploy notice", () => {
  it("reads the same as the single deploy's, code by code", () => {
    for (const code of DEPLOY) {
      expect(deployNoticeFor(code, undefined), code).toEqual(
        deployNotice(refusal(code)),
      );
    }
  });
});

describe("a code deploy and removal share", () => {
  it("states the removal's own way through, not the deploy's", () => {
    expect(removeNotice(refusal("repo-not-registered")).message).toContain(
      "remove again",
    );
    expect(deployNotice(refusal("repo-not-registered")).message).toContain(
      "deploy again",
    );
  });
});

describe("an update that moves more than its row", () => {
  // The tables name Update target; a wider row names its own label instead.
  it.each([
    [
      "preview, unknown",
      updatePreviewNotice(new Error("offline"), "Update targets"),
    ],
    [
      "run, out of date",
      updateNotice(refusal("status-out-of-date"), "Update targets"),
    ],
    [
      "run, linked folder",
      updateNotice(refusal("destination-symlinked"), "Update targets"),
    ],
  ])("names the control by the label the row gives it (%s)", (_, notice) => {
    const message = plainText(notice.message);

    expect(message).toMatch(/[Ss]elect Update targets again\.$/);
    expect(message).not.toMatch(/Update target\b(?!s)/);
  });
});

describe("a linked skill folder", () => {
  const LINKED = "/Users/dev/.claude/skills/tdd";
  const linked = (body: unknown) =>
    new HttpError(409, "unused", "destination-symlinked", body);
  const withPath = linked({
    error: "destination-symlinked",
    linkedPath: LINKED,
  });
  const withoutPath = linked({ error: "destination-symlinked" });

  it.each([
    ["deploy", deployNotice],
    ["update preview", (e: unknown) => updatePreviewNotice(e, "Update target")],
    ["update run", (e: unknown) => updateNotice(e, "Update target")],
  ])("sets apart the rm for the path the server read (%s)", (_, notice) => {
    expect(machineValues(notice(withPath).message)).toEqual([`rm ${LINKED}`]);
    expect(machineValues(notice(withoutPath).message)).toEqual([]);
    expect(notice(withPath).detail).toEqual(notice(withoutPath).detail);
  });

  it("sets apart the rm for the path a bulk run carries", () => {
    expect(
      machineValues(deployNoticeFor("destination-symlinked", LINKED).message),
    ).toEqual([`rm ${LINKED}`]);
  });
});

describe("notices that send the reader to the target", () => {
  it.each([
    ["remove, unfinished", removeNotice(refusal("operation-unfinished"))],
    [
      "update, unfinished",
      updateNotice(refusal("operation-unfinished"), "Update target"),
    ],
    ["update, failed", updateNotice(refusal("update-failed"), "Update target")],
    ["update, unknown", updateNotice(new Error("offline"), "Update target")],
  ])("names the Deploy-state screen (%s)", (_, notice) => {
    expect(notice.message).toContain("on the Deploy-state screen");
    expect(notice.message).not.toContain("target card");
  });
});

describe("a retry", () => {
  const RETRY_CONTROLS = {
    deploy: "Retry deploy",
    remove: "Retry removal",
    update: "Retry update",
  } as const;

  it.each(KINDS)("names the %s's own retry control", (kind) => {
    for (const code of [
      "repo-not-registered",
      "retry-incomplete",
      "retry-failed",
    ]) {
      expect(
        plainText(retryNotice(refusal(code), pending(kind)).message),
        code,
      ).toMatch(new RegExp(`[Ss]elect ${RETRY_CONTROLS[kind]}`));
    }
  });

  it("names the operation in the label of a retry that did not finish", () => {
    for (const code of ["retry-incomplete", "retry-failed"]) {
      const labels = KINDS.map(
        (kind) => retryNotice(refusal(code), pending(kind)).label,
      );
      expect(new Set(labels).size, code).toBe(KINDS.length);
    }
  });

  it("names the release a still-incomplete deploy would install", () => {
    expect(
      machineValues(
        retryNotice(refusal("retry-incomplete"), pending("deploy")).message,
      ),
    ).toEqual(["v0.3.4"]);
  });
});

describe("Repository not registered", () => {
  const STEP = "Select Register repository on the Repositories screen";

  it("names Register repository and its screen in every notice", () => {
    for (const notice of [
      deployNotice(refusal("repo-not-registered")),
      removeNotice(refusal("repo-not-registered")),
      updatePreviewNotice(refusal("repo-not-registered"), "Update target"),
      retryNotice(refusal("repo-not-registered"), pending("deploy")),
      localEditsCheckNotice(refusal("repo-not-registered")),
    ]) {
      expect(readNotice(notice)?.message).toContain(STEP);
    }
  });
});
