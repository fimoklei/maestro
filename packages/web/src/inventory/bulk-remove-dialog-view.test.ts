import { describe, expect, it } from "vitest";
import { HttpError } from "../api/http";
import { removeNotice } from "../deploy-state/notice-copy";
import type { RemovePreflightView } from "../deploy-state/remove-preflight-view";
import {
  type BulkRemoveCheckedTarget,
  bulkRemoveDialogView,
} from "./bulk-remove-dialog-view";

const checking: RemovePreflightView = {
  kind: "offered",
  check: { kind: "unanswered", warning: "checking" },
  reclaim: [],
};

const checkFailed: RemovePreflightView = {
  kind: "offered",
  check: { kind: "unanswered", warning: "check-failed" },
  reclaim: [],
};

const repoCheck = (
  warning: "none" | "cannot-verify" | "cannot-verify" | "check-failed",
): RemovePreflightView => ({
  kind: "offered",
  check: { kind: "repo", warning },
  reclaim: [],
});

const perTool = (
  warnings: Record<string, "none" | "cannot-verify" | "check-failed">,
): RemovePreflightView => ({
  kind: "offered",
  check: { kind: "per-tool", warnings },
  reclaim: [],
});

const refused = (
  code:
    | "repo-not-registered"
    | "no-supported-tool"
    | "deployed-diverged-from-lock"
    | "deployed-diverged-pinned-per-skill",
): RemovePreflightView => ({
  kind: "refused",
  code,
  notice: removeNotice(new HttpError(422, "unused", code)),
});

const target = (
  label: string,
  preflight: RemovePreflightView,
  version = "v1.0.0",
): BulkRemoveCheckedTarget => ({ label, version, preflight });

describe("bulkRemoveDialogView — while the checks run", () => {
  it("reports how many of the targets have answered", () => {
    const view = bulkRemoveDialogView([
      target("global", checking),
      target("/dev/acme-web", repoCheck("none")),
      target("/dev/acme-api", checking),
    ]);

    expect(view).toEqual({
      kind: "checking",
      line: "Checking 3 targets — 1 answered",
    });
  });

  // A refusal and a failed check are answers: both say something about their
  // target, so neither holds the panel in the checking state.
  it("counts a refusal and a failed check as answered", () => {
    const view = bulkRemoveDialogView([
      target("global", refused("no-supported-tool")),
      target("/dev/acme-web", checkFailed),
    ]);

    expect(view.kind).toBe("grouped");
  });
});

describe("bulkRemoveDialogView — the clean summary", () => {
  it("states that nothing else goes when every target is clean", () => {
    const view = bulkRemoveDialogView([
      target("global", repoCheck("none")),
      target("/dev/acme-web", repoCheck("none")),
    ]);

    expect(view).toEqual({
      kind: "grouped",
      clean: {
        label: "2 targets without local edits",
        message: "Only the deployed files are removed.",
      },
      cost: [],
      refused: [],
      refusedNote: null,
      removableCount: 2,
      confirmLabel: "Remove from 2 targets",
    });
  });

  it("counts one target without local edits in the singular beside a group", () => {
    const view = bulkRemoveDialogView([
      target("global", repoCheck("none")),
      target("/dev/acme-web", repoCheck("cannot-verify")),
    ]);

    expect(view.kind === "grouped" && view.clean).toEqual({
      label: "1 target without local edits",
      message: "Only the deployed files are removed.",
    });
  });

  it("renders no clean line at all when nothing is clean", () => {
    const view = bulkRemoveDialogView([
      target("/dev/acme-web", repoCheck("cannot-verify")),
    ]);

    expect(view.kind === "grouped" && view.clean).toBeNull();
  });
});

describe("bulkRemoveDialogView — what the removal costs", () => {
  it("names the target, its deployed version and the reason", () => {
    const view = bulkRemoveDialogView([
      target("/dev/acme-api", repoCheck("cannot-verify"), "v1.0.0"),
    ]);

    expect(view.kind === "grouped" && view.cost).toEqual([
      {
        label: "/dev/acme-api",
        version: "v1.0.0",
        reason: "Nothing recorded — may lose work",
      },
    ]);
  });

  // An unknown is never reported as safe: both leave the copy unmeasured, so both
  // are priced as a possible loss.
  it("puts an unverifiable copy and a check that never ran under cost", () => {
    const view = bulkRemoveDialogView([
      target("/dev/acme-web", repoCheck("cannot-verify")),
      target("/dev/acme-api", checkFailed),
    ]);

    expect(view.kind === "grouped" && view.cost).toEqual([
      {
        label: "/dev/acme-web",
        version: "v1.0.0",
        reason: "Nothing recorded — may lose work",
      },
      {
        label: "/dev/acme-api",
        version: "v1.0.0",
        reason: "Check did not run",
      },
    ]);
    expect(view.kind === "grouped" && view.clean).toBeNull();
  });

  // One removal covers every tool, so the row states the most certain loss
  // among them rather than one tool's answer.
  it("prices a global target on the worst answer any tool gave", () => {
    const view = bulkRemoveDialogView([
      target("global", perTool({ claude: "none", codex: "cannot-verify" })),
    ]);

    expect(view.kind === "grouped" && view.cost).toEqual([
      {
        label: "global",
        version: "v1.0.0",
        reason: "Nothing recorded — may lose work",
      },
    ]);
  });

  // An answer naming no tool measured nothing; its empty map must not price the
  // loudest unknown as clean.
  it("prices a global answer that named no tool as unchecked", () => {
    const view = bulkRemoveDialogView([target("global", perTool({}))]);

    expect(view.kind === "grouped" && view.cost).toEqual([
      { label: "global", version: "v1.0.0", reason: "Check did not run" },
    ]);
  });

  it("leaves a global target clean only when every tool answered clean", () => {
    const view = bulkRemoveDialogView([
      target("global", perTool({ claude: "none", codex: "none" })),
    ]);

    expect(view.kind === "grouped" && view.cost).toEqual([]);
  });
});

describe("bulkRemoveDialogView — what cannot be removed", () => {
  it("lists a refused target with its reason and no version", () => {
    const view = bulkRemoveDialogView([
      target("/dev/legacy-etl", refused("repo-not-registered")),
    ]);

    expect(view.kind === "grouped" && view.refused).toEqual([
      { label: "/dev/legacy-etl", reason: "Repository not registered" },
    ]);
  });

  // One unreachable repo does not stop the good removals, and the confirm
  // names only what it will actually do.
  it("keeps a refused target out of the confirm's count", () => {
    const view = bulkRemoveDialogView([
      target("global", repoCheck("none")),
      target("/dev/acme-web", repoCheck("none")),
      target("/dev/legacy-etl", refused("repo-not-registered")),
    ]);

    expect(view.kind === "grouped" && view.removableCount).toBe(2);
    expect(view.kind === "grouped" && view.confirmLabel).toBe(
      "Remove from 2 targets",
    );
  });

  // A check that could not answer may cost work; it never proves local edits.
  it("carries the cost on the confirm when a cost group exists", () => {
    const view = bulkRemoveDialogView([
      target("global", repoCheck("none")),
      target("/dev/acme-web", repoCheck("cannot-verify")),
      target("/dev/acme-api", checkFailed),
      target("/dev/legacy-etl", refused("repo-not-registered")),
    ]);

    expect(view.kind === "grouped" && view.confirmLabel).toBe(
      "Remove from 3 targets · 2 may lose work",
    );
  });

  it("names a refused edited copy Local edits, as the detail pane does", () => {
    const view = bulkRemoveDialogView([
      target("/dev/acme-web", refused("deployed-diverged-from-lock")),
      target("/dev/acme-api", refused("deployed-diverged-pinned-per-skill")),
    ]);

    expect(view.kind === "grouped" && view.refused).toEqual([
      { label: "/dev/acme-web", reason: "Local edits" },
      { label: "/dev/acme-api", reason: "Local edits" },
    ]);
  });

  it("names one removable target in the singular", () => {
    const view = bulkRemoveDialogView([
      target("global", repoCheck("none")),
      target("/dev/acme-web", refused("deployed-diverged-from-lock")),
    ]);

    expect(view.kind === "grouped" && view.confirmLabel).toBe(
      "Remove from 1 target",
    );
  });

  it("leaves nothing to remove when every target refused", () => {
    const view = bulkRemoveDialogView([
      target("/dev/legacy-etl", refused("repo-not-registered")),
    ]);

    expect(view.kind === "grouped" && view.removableCount).toBe(0);
  });

  // #1436: a target left alone with local changes names its way out.
  it("names the next step under targets refused for local changes", () => {
    const view = bulkRemoveDialogView([
      target("global", repoCheck("none")),
      target("/dev/acme-web", refused("deployed-diverged-from-lock")),
    ]);

    expect(view.kind === "grouped" && view.refusedNote).toBe(
      "Select Deploy skill to restore the released files. Then remove the skill.",
    );
  });

  it("names both next steps when a pinned target also refused", () => {
    const view = bulkRemoveDialogView([
      target("/dev/acme-web", refused("deployed-diverged-from-lock")),
      target("/dev/acme-api", refused("deployed-diverged-pinned-per-skill")),
    ]);

    expect(view.kind === "grouped" && view.refusedNote).toBe(
      "Select Deploy skill to restore the released files. Then remove the skill. Save the changes. Restore the files from the skill's deployed version in the Harness clone. Then remove the skill.",
    );
  });

  it("adds no next step for a refusal without local changes", () => {
    const view = bulkRemoveDialogView([
      target("/dev/legacy-etl", refused("repo-not-registered")),
    ]);

    expect(view.kind === "grouped" && view.refusedNote).toBeNull();
  });
});
