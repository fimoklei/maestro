import type {
  DeployedPrimitive,
  GlobalFolderState,
  ReleaseHead,
} from "@maestro/core";
import { describe, expect, it } from "vitest";
import { type DriftViewModel, driftViewModel } from "../drift/drift-view-model";
import { plainText } from "../ui/phrase";
import { GLOBAL, REPOSITORIES } from "./deploy-state-copy";
import { targetMenuItems } from "./target-menu";
import {
  emptyGroupLines,
  globalRows,
  repoRow,
  type StatusCard,
  statusCard,
  type TargetRow,
} from "./target-rows";
import type { GlobalDeployStateView } from "./use-global-deploy-state";

// Band 2's line, which every Status card repeats.
const COMPARED = "Read just now";

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
  target: { kind: "repo", repoPath: "/me/a", name: "a" },
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

// The hover card as read: its reason sentence in plain text.
const readCard = (card: StatusCard) => ({
  ...card,
  reason: card.reason === null ? null : plainText(card.reason),
});

// The Status hover card: one reason sentence, then the read age (copy.md).
describe("statusCard", () => {
  it("states that a target on the latest release is on it", () => {
    expect(readCard(statusCard(row({ head: ON_LATEST }), COMPARED))).toEqual({
      reason: "On the latest release.",
      readAge: "Read just now",
    });
  });

  it("counts the changed skills in the newer release on a behind target", () => {
    const head = { ...ON_LATEST, release: "v0.3.2", changed: 1, selected: 3 };
    expect(readCard(statusCard(row({ head, behind: true }), COMPARED))).toEqual(
      {
        reason:
          "1 of 3 deployed skills changed in v0.3.4. Select Update target to move this target to v0.3.4.",
        readAge: "Read just now",
      },
    );
  });

  it("says the changes of a newer release could not be read", () => {
    const head = { ...ON_LATEST, release: "v0.3.2", changed: null };
    expect(readCard(statusCard(row({ head, behind: true }), COMPARED))).toEqual(
      {
        reason:
          "Changes in v0.3.4 could not be read. Select Update target to move this target to v0.3.4.",
        readAge: "Read just now",
      },
    );
  });

  it("states that the latest release could not be read", () => {
    expect(
      readCard(
        statusCard(
          row({ head: { ...ON_LATEST, latestRelease: null } }),
          COMPARED,
        ),
      ),
    ).toEqual({
      reason: "Latest release could not be read.",
      readAge: "Read just now",
    });
  });

  it("names the releases of a target pinned per skill", () => {
    expect(
      readCard(
        statusCard(
          row({
            pinned: [
              { release: "v0.3.1", skills: 2 },
              { release: "v0.3.0", skills: 1 },
            ],
          }),
          COMPARED,
        ),
      ),
    ).toEqual({ reason: "2 skills at v0.3.1, 1 at v0.3.0.", readAge: null });
  });

  it("states an unfinished operation without its retry, and claims no release", () => {
    expect(
      readCard(
        statusCard(
          row({
            head: ON_LATEST,
            pending: { kind: "deploy", release: "v0.3.4", desired: ["tdd"] },
          }),
          COMPARED,
        ),
      ),
    ).toEqual({
      reason: "Part of the selection is not on disk.",
      readAge: "Read just now",
    });
    expect(
      readCard(
        statusCard(
          row({
            head: ON_LATEST,
            pending: { kind: "update", release: "v0.3.4", desired: ["tdd"] },
          }),
          COMPARED,
        ),
      ).reason,
    ).toBe("The update is incomplete.");
  });

  it("claims no latest release from a read that failed", () => {
    expect(
      readCard(
        statusCard(
          row({ group: GLOBAL, head: ON_LATEST, readFailed: true }),
          COMPARED,
        ),
      ),
    ).toEqual({ reason: "Deploy-state not read.", readAge: "Read just now" });
  });

  it("explains an Unknown reading as the update check that did not run", () => {
    const unknown = { word: "Unknown", family: "unknown", glyph: "?" } as const;
    expect(
      readCard(statusCard(row({ head: ON_LATEST, status: unknown }), COMPARED)),
    ).toEqual({
      reason: "Update check did not run.",
      readAge: "Read just now",
    });
  });

  it("explains an Unknown reading as the update check that timed out", () => {
    const unknown = { word: "Unknown", family: "unknown", glyph: "?" } as const;
    const drift = driftViewModel({
      data: { ok: false, reason: "timed-out" },
      isError: false,
    });
    expect(
      readCard(
        statusCard(row({ head: ON_LATEST, status: unknown, drift }), COMPARED),
      ),
    ).toEqual({
      reason: "Update check timed out after 1 minute.",
      readAge: "Read just now",
    });
  });

  it("states a repository's failed read alone", () => {
    expect(readCard(statusCard(row({ readFailed: true }), COMPARED))).toEqual({
      reason: "Deploy-state not read.",
      readAge: null,
    });
  });

  it("names the edited skills and Import local edits as the next step", () => {
    expect(
      readCard(
        readCard(
          statusCard(
            row({
              head: ON_LATEST,
              primitives: [
                skill("tdd", "local-edits"),
                skill("grill"),
                skill("review", "local-edits"),
              ],
            }),
            COMPARED,
          ),
        ),
      ),
    ).toEqual({
      reason:
        "2 skills have changes that are not in the latest release: tdd and review. Select Import local edits to keep them.",
      readAge: "Read just now",
    });
  });

  it("names a skipped entry without its fix", () => {
    expect(
      readCard(
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
          COMPARED,
        ),
      ).reason,
    ).toBe("The deploy of skills/tdd landed no files.");
  });

  it("names the other origin of a target with no skill of its own", () => {
    expect(
      readCard(
        statusCard(row({ otherOrigins: ["a/b"], primitives: [] }), COMPARED),
      ).reason,
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

const words = (target: Pick<TargetRow, "status">) =>
  target.status && `${target.status.glyph} ${target.status.word}`;

const folderMarks = (target: TargetRow | undefined) =>
  target?.folders?.map((folder) => [folder.path, words(folder)]);

const claude = (
  primitives: DeployedPrimitive[],
  detected = true,
): GlobalFolderState => ({
  path: "~/.claude/skills",
  tool: "claude",
  detected,
  primitives,
});
const agents = (
  primitives: DeployedPrimitive[],
  detected = true,
): GlobalFolderState => ({
  path: "~/.agents/skills",
  tool: "codex",
  detected,
  primitives,
});

// What the Global read answers: one target, its folders and one skill list.
function globalRead(
  folders: GlobalFolderState[],
  extra: Partial<GlobalDeployStateView> = {},
): GlobalDeployStateView {
  const names = new Set(
    folders.flatMap((folder) => folder.primitives.map((p) => p.name)),
  );
  return {
    primitives: [...names].map((name) => skill(name)),
    folders,
    detectedTools: folders
      .filter((folder) => folder.detected)
      .map((folder) => folder.tool),
    releaseHead: ON_LATEST,
    skipped: [],
    otherOrigins: [],
    ...extra,
  };
}

describe("local edits on a target", () => {
  it("reads a repository holding an edited skill as Local edits", () => {
    const read = (primitives: DeployedPrimitive[]) => ({
      data: { primitives, skipped: [], releaseHead: ON_LATEST },
      isError: false,
    });
    const edited = [skill("tdd", "local-edits"), skill("grill")];
    expect(words(repoRow("/me/a", [], read(edited), syncedDrift))).toBe(
      "⚠ Local edits",
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
      data: {
        primitives: [skill("tdd", "local-edits")],
        skipped: [],
        pendingOperation: {
          kind: "deploy" as const,
          release: "v0.3.4",
          desired: ["tdd"],
        },
      },
      isError: true,
    };
    const unknownDrift = {
      targetIndicator: () => "unknown",
    } as unknown as DriftViewModel;
    expect(words(repoRow("/me/a", [], stale, unknownDrift))).toBe("? Unknown");
    const rows = globalRows(
      globalRead([claude([skill("tdd", "local-edits")])], {
        pendingOperation: stale.data.pendingOperation,
      }),
      syncedDrift,
      true,
    );
    expect(rows.map(words)).toEqual(["? Unknown"]);
  });

  it("offers no retry on a target whose read failed: Re-read is the way back", () => {
    const pendingOperation = {
      kind: "deploy" as const,
      release: "v0.3.4",
      desired: ["tdd"],
    };
    const repo = repoRow(
      "/me/a",
      [],
      {
        data: { primitives: [], skipped: [], pendingOperation },
        isError: true,
      },
      syncedDrift,
    );
    const [global] = globalRows(
      globalRead([claude([])], { pendingOperation }),
      syncedDrift,
      true,
    );
    if (global === undefined) throw new Error("no Global row");
    for (const unread of [repo, global]) {
      expect(targetMenuItems(unread, false).map((item) => item.action)).toEqual(
        ["deploy"],
      );
    }
  });

  it("reads only the folder whose copy was edited as Local edits", () => {
    const [global] = globalRows(
      globalRead([
        claude([skill("tdd", "local-edits")]),
        agents([skill("tdd")]),
      ]),
      syncedDrift,
      false,
    );
    expect(folderMarks(global)).toEqual([
      ["~/.claude/skills", "⚠ Local edits"],
      ["~/.agents/skills", "✓ In sync"],
    ]);
  });
});

describe("a Global folder left at an older release", () => {
  const head = { ...ON_LATEST, release: "v2.0.0", latestRelease: "v2.0.0" };
  const lagging = (
    notUpdated: GlobalFolderState["notUpdated"],
    edited = false,
  ) => {
    const [global] = globalRows(
      globalRead(
        [
          claude([skill("code-review", edited ? "local-edits" : undefined)]),
          { ...agents([skill("code-review")]), notUpdated },
        ],
        { releaseHead: head },
      ),
      syncedDrift,
      false,
    );
    if (global === undefined) throw new Error("no Global row");
    return global;
  };

  it("reads that folder and the Global row as Not updated, over Local edits", () => {
    const global = lagging([{ name: "code-review", stillAt: "v1.0.0" }], true);
    expect(folderMarks(global)).toEqual([
      ["~/.claude/skills", "⚠ Local edits"],
      ["~/.agents/skills", "⚠ Not updated"],
    ]);
    expect(words(global)).toBe("⚠ Not updated");
  });

  it("names the release the copy is still at in the hover card", () => {
    const global = lagging([{ name: "code-review", stillAt: "v1.0.0" }]);
    expect(readCard(statusCard(global, COMPARED)).reason).toBe(
      "code-review in ~/.agents/skills is still at v1.0.0, but the Target release is v2.0.0.",
    );
  });

  it("names no release in the hover card where no older tag matched", () => {
    const global = lagging([{ name: "code-review", stillAt: null }]);
    expect(readCard(statusCard(global, COMPARED)).reason).toBe(
      "code-review in ~/.agents/skills is not at the Target release v2.0.0.",
    );
  });
});

describe("a Global folder that lacks skills", () => {
  const lacking = (missing: string[]) => {
    const [global] = globalRows(
      globalRead([
        claude([skill("code-review"), skill("tdd")]),
        {
          ...agents([skill("code-review", "local-edits")]),
          missing,
          notUpdated: [{ name: "code-review", stillAt: "v1.0.0" }],
        },
      ]),
      syncedDrift,
      false,
    );
    if (global === undefined) throw new Error("no Global row");
    return global;
  };

  it("reads that folder and the Global row as Skills missing, over Not updated", () => {
    const global = lacking(["tdd"]);
    expect(folderMarks(global)).toEqual([
      ["~/.claude/skills", "✓ In sync"],
      ["~/.agents/skills", "⚠ Skills missing"],
    ]);
    expect(words(global)).toBe("⚠ Skills missing");
  });

  it("counts the missing skills against Global's list in the hover card", () => {
    expect(readCard(statusCard(lacking(["tdd"]), COMPARED)).reason).toBe(
      "1 of 2 deployed skills is missing in ~/.agents/skills.",
    );
  });

  it("leaves a folder holding every skill without a missing line", () => {
    const [global] = globalRows(
      globalRead([claude([skill("tdd")]), agents([skill("tdd")])]),
      syncedDrift,
      false,
    );
    expect(global?.folders?.map((folder) => folder.missing)).toEqual([
      null,
      null,
    ]);
  });
});

describe("copies in an undetected tool's folder", () => {
  const head = { ...ON_LATEST, release: "v2.0.0", latestRelease: "v2.0.0" };
  const stray = (strayCopies: GlobalFolderState["strayCopies"]) => {
    const [global] = globalRows(
      globalRead(
        [
          claude([skill("code-review"), skill("tdd")]),
          { ...agents([], false), strayCopies },
        ],
        { releaseHead: head },
      ),
      syncedDrift,
      false,
    );
    if (global === undefined) throw new Error("no Global row");
    return global;
  };

  it("counts the copies on the muted folder row", () => {
    expect(
      stray([
        { name: "code-review", atRelease: false },
        { name: "tdd", atRelease: true },
      ]).folders?.map((folder) => folder.note),
    ).toEqual([null, "Codex not detected · not written · 2 copies"]);
  });

  it("reads Global as Not updated where a copy differs from the Target release", () => {
    const global = stray([
      { name: "code-review", atRelease: false },
      { name: "tdd", atRelease: false },
    ]);
    expect(words(global)).toBe("⚠ Not updated");
    expect(readCard(statusCard(global, COMPARED)).reason).toBe(
      "2 copies in ~/.agents/skills differ from v2.0.0. Global does not write there because Codex is not detected.",
    );
  });

  it("counts only the differing copies in the hover card", () => {
    const global = stray([
      { name: "code-review", atRelease: false },
      { name: "tdd", atRelease: true },
    ]);
    expect(readCard(statusCard(global, COMPARED)).reason).toBe(
      "1 copy in ~/.agents/skills differs from v2.0.0. Global does not write there because Codex is not detected.",
    );
  });

  it("raises no Status where every copy equals the Target release", () => {
    expect(words(stray([{ name: "code-review", atRelease: true }]))).toBe(
      "✓ In sync",
    );
  });
});

describe("Global as one target", () => {
  it("reads one Global row whose Status is its worst folder's", () => {
    const rows = globalRows(
      globalRead([
        claude([skill("tdd")]),
        agents([skill("tdd", "local-edits")]),
      ]),
      syncedDrift,
      false,
    );
    expect(rows.map((target) => [target.name, words(target)])).toEqual([
      ["Global", "⚠ Local edits"],
    ]);
  });

  it("lists every Global folder under the row, with who reads it", () => {
    const [global] = globalRows(
      globalRead([claude([skill("tdd")]), agents([skill("tdd")])]),
      syncedDrift,
      false,
    );
    expect(
      global?.folders?.map((folder) => [folder.path, folder.readBy]),
    ).toEqual([
      ["~/.claude/skills", "Read by Claude Code, Cursor and OpenCode."],
      [
        "~/.agents/skills",
        "Read by Codex, Copilot CLI, Cursor, Gemini CLI and others.",
      ],
    ]);
  });

  it("reads an undetected tool's folder as not written, with no mark", () => {
    const [global] = globalRows(
      globalRead([claude([skill("tdd")]), agents([], false)]),
      syncedDrift,
      false,
    );
    expect(
      global?.folders?.map((folder) => [
        folder.path,
        folder.detected,
        folder.status,
        folder.note,
      ]),
    ).toEqual([
      [
        "~/.claude/skills",
        true,
        expect.objectContaining({ word: "In sync" }),
        null,
      ],
      ["~/.agents/skills", false, null, "Codex not detected · not written"],
    ]);
    expect(words(global as TargetRow)).toBe("✓ In sync");
  });

  it("shows no Global row while no tool is detected", () => {
    expect(
      globalRows(
        globalRead([claude([], false), agents([], false)]),
        syncedDrift,
        false,
      ),
    ).toEqual([]);
  });

  it("acts on Global as one target, under its own name", () => {
    const [global] = globalRows(
      globalRead([claude([skill("tdd")]), agents([skill("tdd")])]),
      syncedDrift,
      false,
    );
    expect(global).toMatchObject({
      id: "global",
      name: "Global",
      updateName: "Global",
      wire: { kind: "global" },
      target: {
        kind: "global",
        folders: ["~/.claude/skills", "~/.agents/skills"],
      },
      skills: 1,
    });
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
      })?.map(plainText),
    ).toEqual([
      "Install Claude Code or Codex to deploy skills globally.",
      "hooks/guard is deployed as claude_hook, which Maestro does not manage. Its files are still there.",
    ]);
  });

  it("says how to register on an empty Repositories group", () => {
    expect(emptyGroupLines(REPOSITORIES, read)).toEqual([
      "No repositories yet. Select Register repository on the Repositories screen.",
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
