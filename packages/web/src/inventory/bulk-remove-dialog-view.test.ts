import { describe, expect, it } from "vitest";
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
  warning: "none" | "local-edits" | "cannot-verify" | "check-failed",
): RemovePreflightView => ({
  kind: "offered",
  check: { kind: "repo", warning },
  reclaim: [],
});

const perTool = (
  warnings: Record<string, "none" | "local-edits" | "check-failed">,
): RemovePreflightView => ({
  kind: "offered",
  check: { kind: "per-tool", warnings },
  reclaim: [],
});

const refused = (
  code: "repo-not-registered" | "no-supported-tool",
): RemovePreflightView => ({
  kind: "refused",
  code,
  message: "The server's own long sentence about it.",
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
      line: "checking 3 targets — 1 answered",
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
      cleanLine: "2 clean copies — nothing but the deployed files goes",
      cost: [],
      refused: [],
      removableCount: 2,
      confirmLabel: "remove from 2 →",
    });
  });

  it("counts the clean copies plainly once a group sits beside them", () => {
    const view = bulkRemoveDialogView([
      target("global", repoCheck("none")),
      target("/dev/acme-web", repoCheck("local-edits")),
    ]);

    expect(view.kind === "grouped" && view.cleanLine).toBe("1 clean copies");
  });

  it("renders no clean line at all when nothing is clean", () => {
    const view = bulkRemoveDialogView([
      target("/dev/acme-web", repoCheck("local-edits")),
    ]);

    expect(view.kind === "grouped" && view.cleanLine).toBeNull();
  });
});

describe("bulkRemoveDialogView — what the removal costs", () => {
  it("names the target, its deployed version and the reason", () => {
    const view = bulkRemoveDialogView([
      target("/dev/acme-api", repoCheck("local-edits"), "v1.0.0"),
    ]);

    expect(view.kind === "grouped" && view.cost).toEqual([
      {
        label: "/dev/acme-api",
        version: "v1.0.0",
        reason: "local edits — deleted too",
      },
    ]);
  });

  // J04 on consent: an unknown is never quietly reported as safe. Both of
  // these leave the copy unmeasured, so both are priced as a possible loss.
  it("puts an unverifiable copy and a check that never ran under cost", () => {
    const view = bulkRemoveDialogView([
      target("/dev/acme-web", repoCheck("cannot-verify")),
      target("/dev/acme-api", checkFailed),
    ]);

    expect(view.kind === "grouped" && view.cost).toEqual([
      {
        label: "/dev/acme-web",
        version: "v1.0.0",
        reason: "nothing recorded — may lose work",
      },
      {
        label: "/dev/acme-api",
        version: "v1.0.0",
        reason: "check did not run",
      },
    ]);
    expect(view.kind === "grouped" && view.cleanLine).toBeNull();
  });

  // One removal covers every tool, so the row states the most certain loss
  // among them rather than one tool's answer.
  it("prices a global target on the worst answer any tool gave", () => {
    const view = bulkRemoveDialogView([
      target("global", perTool({ claude: "none", codex: "local-edits" })),
    ]);

    expect(view.kind === "grouped" && view.cost).toEqual([
      {
        label: "global",
        version: "v1.0.0",
        reason: "local edits — deleted too",
      },
    ]);
  });

  // An answer naming no tool at all has measured nothing. Reading its empty
  // map as "no warnings found" would price the loudest unknown as clean (J04).
  it("prices a global answer that named no tool as unchecked", () => {
    const view = bulkRemoveDialogView([target("global", perTool({}))]);

    expect(view.kind === "grouped" && view.cost).toEqual([
      { label: "global", version: "v1.0.0", reason: "check did not run" },
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
      { label: "/dev/legacy-etl", reason: "repo not registered" },
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
      "remove from 2 →",
    );
  });

  it("carries the cost on the confirm when a cost group exists", () => {
    const view = bulkRemoveDialogView([
      target("global", repoCheck("none")),
      target("/dev/acme-web", repoCheck("local-edits")),
      target("/dev/acme-api", checkFailed),
      target("/dev/legacy-etl", refused("repo-not-registered")),
    ]);

    expect(view.kind === "grouped" && view.confirmLabel).toBe(
      "remove from 3 · 2 lose local edits →",
    );
  });

  it("leaves nothing to remove when every target refused", () => {
    const view = bulkRemoveDialogView([
      target("/dev/legacy-etl", refused("repo-not-registered")),
    ]);

    expect(view.kind === "grouped" && view.removableCount).toBe(0);
  });
});
