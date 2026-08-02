import type { BulkRemoveReport } from "@maestro/core";
import { describe, expect, it } from "vitest";
import { HttpError } from "../api/http";
import { bulkRemoveReportView } from "./bulk-remove-report-view";
import type { BulkRemoveCandidate } from "./bulk-remove-targets";

const TARGETS: BulkRemoveCandidate[] = [
  { target: { kind: "global" }, label: "global", version: "v1.0.0" },
  {
    target: { kind: "repo", repoPath: "/dev/acme-web" },
    label: "/dev/acme-web",
    version: "v1.0.0",
  },
  {
    target: { kind: "repo", repoPath: "/dev/legacy-etl" },
    label: "/dev/legacy-etl",
    version: "v1.0.0",
  },
];

const report = (over: Partial<BulkRemoveReport> = {}): BulkRemoveReport => ({
  name: "tdd",
  removed: [],
  refused: [],
  failed: [],
  ...over,
});

const view = (input: {
  report?: BulkRemoveReport;
  error?: unknown;
  targets?: BulkRemoveCandidate[];
}) =>
  bulkRemoveReportView({
    targets: input.targets ?? TARGETS,
    report: input.report,
    error: input.error,
  });

describe("bulkRemoveReportView — before the run answers", () => {
  it("states no report at all", () => {
    expect(view({})).toBeNull();
  });
});

describe("bulkRemoveReportView — a clean run", () => {
  const clean = view({
    report: report({
      removed: TARGETS.map((candidate) => ({
        target: candidate.target,
        version: "v1.0.0",
      })),
    }),
  });

  it("names the skill without a split, so the common case reads as one outcome", () => {
    expect(clean).toMatchObject({
      kind: "clean",
      title: { before: "Removed ", after: "" },
    });
  });

  it("counts every class, so zero refused and zero failed are stated rather than implied", () => {
    expect(clean).toMatchObject({ counts: "removed 3 · refused 0 · failed 0" });
  });
});

describe("bulkRemoveReportView — a partial run", () => {
  const partial = view({
    report: report({
      removed: [
        { target: TARGETS[0]?.target ?? { kind: "global" }, version: "v1.0.0" },
      ],
      refused: [
        {
          target: TARGETS[2]?.target ?? { kind: "global" },
          reason: "repo-not-registered",
        },
      ],
      failed: [
        {
          target: TARGETS[1]?.target ?? { kind: "global" },
          reason: "remove-in-progress",
        },
      ],
    }),
  });

  it("puts the split in the title, so the outcome lands before any detail", () => {
    expect(partial).toMatchObject({
      kind: "partial",
      title: { before: "Removed ", after: " from 1 of 3" },
      counts: "removed 1 · refused 1 · failed 1",
    });
  });

  // Both halves of "why was this left": the class that skipped it, and the
  // reason under that class. One without the other says nothing to act on.
  it("carries each left-alone target's class and its own reason", () => {
    expect(partial).toMatchObject({
      leftAlone: [
        {
          label: "/dev/acme-web",
          outcome: "failed",
          reason: "target is held by another operation",
        },
        {
          label: "/dev/legacy-etl",
          outcome: "refused",
          reason: "repo not registered",
        },
      ],
    });
  });

  // A row nobody can name is still a target the run left behind; dropping it
  // would report a cleaner run than the one that happened.
  // A failed removal can still have taken the copy off disk. The row says so:
  // "go and look" and "nothing left to do" are opposite instructions.
  it("adds what the probe proved about a failed target's copy", () => {
    const probed = (outcome: unknown) =>
      view({
        report: report({
          failed: [
            {
              target: TARGETS[0]?.target ?? { kind: "global" },
              reason: "remove-failed",
              outcome,
            } as never,
          ],
        }),
      }) as { leftAlone: { reason: string }[] };

    expect(
      probed({ scope: "repo", state: "removed" }).leftAlone[0]?.reason,
    ).toBe("apm did not complete the removal — gone anyway");
    expect(
      probed({ scope: "repo", state: "not-removed" }).leftAlone[0]?.reason,
    ).toBe("apm did not complete the removal — still there");
    // A probe that could not answer proves nothing, so it says nothing (J04).
    expect(
      probed({ scope: "repo", state: "unknown" }).leftAlone[0]?.reason,
    ).toBe("apm did not complete the removal");
  });

  // apm removes for every tool at once, so one tool still holding a copy means
  // the target is not clear — the worst answer wins.
  it("reads a global probe as still there when any tool still holds a copy", () => {
    const mixed = view({
      report: report({
        failed: [
          {
            target: TARGETS[0]?.target ?? { kind: "global" },
            reason: "remove-failed",
            outcome: {
              scope: "global",
              tools: [
                { tool: "claude-code", state: "removed" },
                { tool: "codex", state: "not-removed" },
              ],
            },
          } as never,
        ],
      }),
    }) as { leftAlone: { reason: string }[] };

    expect(mixed.leftAlone[0]?.reason).toBe(
      "apm did not complete the removal — still there",
    );
  });

  // The two refusals #483 added. They stay apart (J04): one says the edits were
  // seen and never priced, the other that they could not be checked at all.
  it("names both unconfirmed-edits refusals without letting them share a wording", () => {
    const reasonFor = (reason: string) =>
      (
        view({
          report: report({
            failed: [
              {
                target: TARGETS[0]?.target ?? { kind: "global" },
                reason: reason as never,
              },
            ],
          }),
        }) as { leftAlone: { reason: string }[] }
      ).leftAlone[0]?.reason;

    const seen = reasonFor("local-edits-unconfirmed");
    const unverifiable = reasonFor("unverifiable-edits-unconfirmed");

    expect(seen).not.toBe("local-edits-unconfirmed");
    expect(unverifiable).not.toBe("unverifiable-edits-unconfirmed");
    expect(seen).not.toBe(unverifiable);
  });

  // A row whose reason this build cannot name is still a target left behind;
  // a blank slot beside it would read as no reason at all.
  it("falls back to the raw code when the run names a reason it does not know", () => {
    const unknown = view({
      report: report({
        failed: [
          {
            target: TARGETS[0]?.target ?? { kind: "global" },
            reason: "invented-later" as never,
          },
        ],
      }),
    });

    expect(unknown).toMatchObject({
      leftAlone: [{ label: "global", reason: "invented-later" }],
    });
  });

  it("falls back to the target's own key when the run names one nobody listed", () => {
    const stray = view({
      targets: [],
      report: report({
        failed: [
          {
            target: { kind: "repo", repoPath: "/dev/gone" },
            reason: "not-deployed",
          },
        ],
      }),
    });

    expect(stray).toMatchObject({
      kind: "partial",
      leftAlone: [{ label: "/dev/gone", reason: "nothing deployed here" }],
    });
  });
});

describe("bulkRemoveReportView — the request itself failed", () => {
  // The server answered, so the walk never began: retrying repeats nothing.
  it("says the run never started when the server refused the request", () => {
    expect(
      view({ error: new HttpError(400, "Malformed request.", "invalid-body") }),
    ).toEqual({
      kind: "never-started",
      label: "the run never started",
      message: "Malformed request. Nothing was removed anywhere. Try again.",
    });
  });

  // No answer at all proves nothing about the walk — it may have finished.
  it("says the outcome is unknown when the answer was lost", () => {
    const lost = view({ error: new TypeError("Failed to fetch") });

    expect(lost).toMatchObject({ kind: "outcome-unknown" });
    expect((lost as { message: string }).message).toMatch(
      /cannot say what was removed/i,
    );
  });

  // A server that broke may have broken part-way through its own walk. Only a
  // refusal it made before starting proves nothing was touched.
  it("says the outcome is unknown when the server broke rather than refused", () => {
    expect(view({ error: new HttpError(500, "Boom.") })).toMatchObject({
      kind: "outcome-unknown",
    });
  });

  it("shows no counts either way, so a lost run never reads as a clean one", () => {
    for (const error of [new HttpError(500, "Boom."), new TypeError("x")]) {
      expect(view({ error })).not.toHaveProperty("counts");
    }
  });
});
