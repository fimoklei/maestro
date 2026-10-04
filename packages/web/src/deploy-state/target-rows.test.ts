import type {
  DeployedPrimitive,
  ReleaseHead,
  SupportedTool,
} from "@maestro/core";
import { describe, expect, it } from "vitest";
import type { DriftViewModel } from "../drift/drift-view-model";
import { GLOBAL, REPOSITORIES } from "./deploy-state-copy";
import {
  emptyGroupLines,
  globalRows,
  repoRow,
  statusCard,
  type TargetRow,
} from "./target-rows";

const NOW = new Date("2026-09-24T10:00:00Z");

const ON_LATEST: ReleaseHead = {
  release: "v0.3.4",
  latestRelease: "v0.3.4",
  changed: 0,
  changedSkills: [],
  selection: ["tdd"],
  selected: 1,
  comparedAt: "2026-09-24T10:00:00Z",
};

const row = (facts: Partial<TargetRow>): TargetRow => ({
  id: "repo:/me/a",
  group: REPOSITORIES,
  name: "a",
  path: "/me/a",
  target: { kind: "repo", repoPath: "/me/a" },
  wire: { kind: "repo", repoPath: "/me/a" },
  updateName: "a",
  release: null,
  status: null,
  skills: 1,
  primitives: [],
  drift: {} as DriftViewModel,
  skipped: [],
  otherOrigins: [],
  readFailed: false,
  behind: false,
  ...facts,
});

// The Status hover card: one reason sentence, then the read age (copy.md).
describe("statusCard", () => {
  it("states that a target on the latest release is on it", () => {
    expect(statusCard(row({ head: ON_LATEST }), NOW)).toEqual({
      reason: "On the latest release.",
      readAge: "Read just now",
    });
  });

  it("counts the changed skills in the newer release on a behind target", () => {
    const head = { ...ON_LATEST, release: "v0.3.2", changed: 1, selected: 3 };
    expect(statusCard(row({ head, behind: true }), NOW)).toEqual({
      reason: "1 of 3 deployed skills changed in v0.3.4.",
      readAge: "Read just now",
    });
  });

  it("says the changes of a newer release could not be read", () => {
    const head = { ...ON_LATEST, release: "v0.3.2", changed: null };
    expect(statusCard(row({ head, behind: true }), NOW)).toEqual({
      reason: "Changes in v0.3.4 could not be read.",
      readAge: "Read just now",
    });
  });

  it("states that the latest release could not be read", () => {
    expect(
      statusCard(row({ head: { ...ON_LATEST, latestRelease: null } }), NOW),
    ).toEqual({
      reason: "Latest release could not be read.",
      readAge: "Read just now",
    });
  });

  it("names the releases of a target pinned per skill", () => {
    expect(
      statusCard(
        row({
          pinned: [
            { release: "v0.3.1", skills: 2 },
            { release: "v0.3.0", skills: 1 },
          ],
        }),
        NOW,
      ),
    ).toEqual({ reason: "2 skills at v0.3.1, 1 at v0.3.0.", readAge: null });
  });

  it("states an unfinished operation without its retry, and claims no release", () => {
    expect(
      statusCard(
        row({
          head: ON_LATEST,
          pending: { kind: "deploy", release: "v0.3.4", desired: ["tdd"] },
        }),
        NOW,
      ),
    ).toEqual({
      reason: "Part of the selection is not on disk.",
      readAge: "Read just now",
    });
    expect(
      statusCard(
        row({
          head: ON_LATEST,
          pending: { kind: "update", release: "v0.3.4", desired: ["tdd"] },
        }),
        NOW,
      ).reason,
    ).toBe("The update is incomplete.");
  });

  it("names another tool as behind on a global tool already on the latest release", () => {
    expect(
      statusCard(row({ group: GLOBAL, head: ON_LATEST, behind: true }), NOW),
    ).toEqual({
      reason: "Another tool's skills are behind v0.3.4.",
      readAge: "Read just now",
    });
  });

  it("claims no latest release from a read that failed", () => {
    expect(
      statusCard(
        row({ group: GLOBAL, head: ON_LATEST, readFailed: true }),
        NOW,
      ),
    ).toEqual({ reason: "Deploy-state not read", readAge: "Read just now" });
  });

  it("explains an Unknown reading as the update check that did not run", () => {
    const unknown = { word: "Unknown", family: "unknown", glyph: "?" } as const;
    expect(statusCard(row({ head: ON_LATEST, status: unknown }), NOW)).toEqual({
      reason: "Update check did not run.",
      readAge: "Read just now",
    });
  });

  it("states a repository's failed read alone", () => {
    expect(statusCard(row({ readFailed: true }), NOW)).toEqual({
      reason: "Deploy-state not read",
      readAge: null,
    });
  });

  it("names the edited skills without the import action", () => {
    expect(
      statusCard(
        row({
          head: ON_LATEST,
          primitives: [
            skill("tdd", "local-edits"),
            skill("grill"),
            skill("review", "local-edits"),
          ],
        }),
        NOW,
      ),
    ).toEqual({
      reason:
        "2 skills have changes that are not in the latest release: tdd and review.",
      readAge: "Read just now",
    });
  });

  it("names a skipped entry without its fix", () => {
    expect(
      statusCard(
        row({
          head: ON_LATEST,
          skipped: [
            {
              reason: "invalid-package",
              virtualPath: "skills/tdd",
              packageType: "invalid",
            },
          ],
        }),
        NOW,
      ).reason,
    ).toBe("The deploy of skills/tdd landed no files.");
  });

  it("names the other origin of a target with no skill of its own", () => {
    expect(
      statusCard(row({ otherOrigins: ["a/b"], primitives: [] }), NOW).reason,
    ).toBe("Holds skills, hooks and MCP servers deployed from a/b.");
  });
});

const skill = (
  name: string,
  copy?: DeployedPrimitive["copy"],
): DeployedPrimitive => ({
  type: "skill",
  name,
  version: "v0.3.4",
  ...(copy ? { copy } : {}),
});

const syncedDrift = {
  targetIndicator: () => "ok",
  forTool: () => syncedDrift,
} as unknown as DriftViewModel;

const words = (target: TargetRow) =>
  target.status && `${target.status.glyph} ${target.status.word}`;

describe("local edits on a target", () => {
  it("reads a repository holding an edited skill as Local edits", () => {
    const read = (primitives: DeployedPrimitive[]) => ({
      data: { primitives, skipped: [], releaseHead: ON_LATEST },
      isError: false,
    });
    const edited = [skill("tdd", "local-edits"), skill("grill")];
    expect(words(repoRow("/me/a", [], read(edited), syncedDrift))).toBe(
      "✎ Local edits",
    );
    expect(words(repoRow("/me/a", [], read([skill("tdd")]), syncedDrift))).toBe(
      "✓ In sync",
    );
    expect(
      words(
        repoRow("/me/a", [], read([skill("tdd", "unverified")]), syncedDrift),
      ),
    ).toBe("✓ In sync");
  });

  it("reads a failed read as Unknown, whatever its stale rows say", () => {
    const stale = {
      data: { primitives: [skill("tdd", "local-edits")], skipped: [] },
      isError: true,
    };
    const unknownDrift = {
      targetIndicator: () => "unknown",
    } as unknown as DriftViewModel;
    expect(words(repoRow("/me/a", [], stale, unknownDrift))).toBe("? Unknown");
    const rows = globalRows(
      {
        tools: [{ tool: "claude", primitives: [skill("tdd", "local-edits")] }],
        detectedTools: ["claude"],
        primitives: [],
        skipped: [],
        otherOrigins: [],
      },
      syncedDrift,
      true,
    );
    expect(rows.map(words)).toEqual(["? Unknown"]);
  });

  it("reads only the tool whose copy was edited as Local edits", () => {
    const tool = (name: SupportedTool, primitives: DeployedPrimitive[]) => ({
      tool: name,
      primitives,
      releaseHead: ON_LATEST,
    });
    const rows = globalRows(
      {
        tools: [
          tool("claude", [skill("tdd", "local-edits")]),
          tool("codex", [skill("tdd")]),
        ],
        detectedTools: ["claude", "codex"],
        primitives: [],
        skipped: [],
        otherOrigins: [],
      },
      syncedDrift,
      false,
    );
    expect(rows.map(words)).toEqual(["✎ Local edits", "✓ In sync"]);
  });
});

describe("emptyGroupLines", () => {
  const read = {
    filtered: false,
    global: { tools: 0, skipped: [] },
    repositories: 0,
  };

  it("names the missing tool on an empty Global group, then each skipped entry", () => {
    expect(
      emptyGroupLines(GLOBAL, {
        ...read,
        global: {
          tools: 0,
          skipped: [
            {
              reason: "unsupported-type",
              virtualPath: "hooks/guard",
              packageType: "claude_hook",
            },
          ],
        },
      }),
    ).toEqual([
      "Install Claude Code or Codex to deploy skills globally.",
      "hooks/guard is deployed as claude_hook, which Maestro does not manage. Its files are still there.",
    ]);
  });

  it("says how to register on an empty Repositories group", () => {
    expect(emptyGroupLines(REPOSITORIES, read)).toEqual([
      "No repositories registered yet. Select Register repository on the Repositories screen.",
    ]);
  });

  // A filtered-out group is No filter match's; a failed read is the notice's.
  it("leaves a filtered or unread group to the screen's own line", () => {
    expect(emptyGroupLines(GLOBAL, { ...read, filtered: true })).toBeNull();
    expect(
      emptyGroupLines(REPOSITORIES, { ...read, filtered: true }),
    ).toBeNull();
    expect(emptyGroupLines(GLOBAL, { ...read, global: null })).toBeNull();
    expect(
      emptyGroupLines(REPOSITORIES, { ...read, repositories: null }),
    ).toBeNull();
  });

  it("says nothing on a group that has targets", () => {
    expect(
      emptyGroupLines(GLOBAL, { ...read, global: { tools: 1, skipped: [] } }),
    ).toBeNull();
    expect(
      emptyGroupLines(REPOSITORIES, { ...read, repositories: 2 }),
    ).toBeNull();
  });
});
