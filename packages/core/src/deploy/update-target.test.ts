import { describe, expect, it } from "vitest";
import type { HarnessTag } from "../harness/read-harness-state";
import type { HarnessSkillTree } from "../harness/skill-movements";
import type { DeployedContentState, DeployTarget } from "./deploy-skill";
import type { SupportedTool } from "./deploy-tools";
import { LocalCopyGuard } from "./local-copy-guard";
import { UpdateTarget } from "./update-target";

const REPO: DeployTarget = { kind: "repo", repoPath: "/repo" };
const GLOBAL: DeployTarget = { kind: "global" };

const tags = (...names: string[]): HarnessTag[] =>
  names.map((name) => ({ name, commit: name }));

const trees = (content: Record<string, string>): HarnessSkillTree[] =>
  Object.entries(content).map(([name, treeHash]) => ({ name, treeHash }));

// tdd and jobs change, review disappears, grill and brief stay, wizard arrives.
const TREES: Record<string, HarnessSkillTree[]> = {
  "v0.3.2": trees({ tdd: "a", grill: "b", jobs: "c", review: "d", brief: "e" }),
  "v0.3.4": trees({
    tdd: "a2",
    grill: "b",
    jobs: "c2",
    brief: "e",
    wizard: "f",
  }),
};

const SELECTION = ["tdd", "grill", "jobs", "review", "brief"];

// What the guard reads back on a target whose copies all match: the state
// #954 re-checks against before it may act on a token.
const CLEAN_COPIES = {
  findings: SELECTION.map((name) => ({
    name,
    tool: null,
    verdict: "clean" as const,
  })),
};

type Options = {
  selection?: readonly string[] | null;
  release?: string;
  root?: string | undefined;
  tagNames?: string[] | null;
  treesAt?: (tag: string) => HarnessSkillTree[] | null;
  origin?: { host: string; ownerRepo: string } | null;
  detected?: SupportedTool[];
  registered?: boolean;
  copies?: Record<string, DeployedContentState>;
  target?: DeployTarget;
};

function subject(options: Options = {}) {
  const update = new UpdateTarget({
    registry: { isRegistered: async () => options.registered ?? true },
    targetSelection: {
      read: async () =>
        options.selection === null
          ? { ok: false, reason: "not-deployed" }
          : {
              ok: true,
              release: options.release ?? "v0.3.2",
              selection: options.selection ?? SELECTION,
            },
    },
    git: {
      readTags: async () =>
        options.tagNames === null
          ? null
          : tags(...(options.tagNames ?? ["v0.3.2", "v0.3.4"])),
      readSkillTreesAtTag: async (_root, tag) =>
        options.treesAt ? options.treesAt(tag) : (TREES[tag] ?? null),
    },
    resolveRoot: async () => ("root" in options ? options.root : "/harness"),
    harnessOrigin: async () =>
      options.origin === undefined
        ? { host: "github.com", ownerRepo: "fimoklei/harness" }
        : options.origin,
    toolPresence: {
      detectGlobalTools: async () => options.detected ?? ["claude"],
    },
    copyGuard: new LocalCopyGuard({
      content: {
        classify: async ({ name }) => options.copies?.[name] ?? "clean",
      },
    }),
  });
  return {
    update,
    preview: () => update.preview({ target: options.target ?? REPO }),
  };
}

async function previewed(options: Options = {}) {
  const result = await subject(options).preview();
  if (!result.ok) {
    throw new Error(`preview refused: ${result.error}`);
  }
  return result.preview;
}

describe("UpdateTarget.preview", () => {
  it("counts what the latest release changes, removes and leaves alone", async () => {
    const preview = await previewed();

    expect(preview.release).toBe("v0.3.2");
    expect(preview.chosenRelease).toBe("v0.3.4");
    expect(preview.counts).toStrictEqual({
      changed: 2,
      removed: 1,
      unchanged: 2,
    });
  });

  it("places every selected skill in exactly one section", async () => {
    const preview = await previewed();

    expect(preview.changed.map((row) => row.name)).toStrictEqual([
      "tdd",
      "jobs",
    ]);
    expect(preview.removed).toStrictEqual(["review"]);
    expect(preview.unchanged).toStrictEqual(["grill", "brief"]);
    expect(preview.newInRelease.map((row) => row.name)).toStrictEqual([
      "wizard",
    ]);
    // The Inventory's second entrance fills this; an Update from the card adds
    // no skill of its own (#955).
    expect(preview.addedByThisDeploy).toStrictEqual([]);
  });

  it("links a changed and a new skill to its folder at the chosen release", async () => {
    const preview = await previewed();

    expect(preview.changed[0]?.url).toBe(
      "https://github.com/fimoklei/harness/tree/v0.3.4/.apm/skills/tdd",
    );
    expect(preview.newInRelease[0]?.url).toBe(
      "https://github.com/fimoklei/harness/tree/v0.3.4/.apm/skills/wizard",
    );
  });

  it("names no link when the connected Harness has no usable origin", async () => {
    const preview = await previewed({ origin: null });

    expect(preview.changed.every((row) => row.url === null)).toBe(true);
  });

  it("drops the names this release removed from the desired Selection", async () => {
    const preview = await previewed();

    expect(preview.selection.current).toStrictEqual(SELECTION);
    expect(preview.selection.desired).toStrictEqual([
      "tdd",
      "grill",
      "jobs",
      "brief",
    ]);
  });

  it("leaves an empty desired Selection when the release removes every skill", async () => {
    const preview = await previewed({ selection: ["review"] });

    expect(preview.selection.desired).toStrictEqual([]);
    expect(preview.counts).toStrictEqual({
      changed: 0,
      removed: 1,
      unchanged: 0,
    });
  });

  it("counts nothing changed when the release touches no selected skill", async () => {
    const preview = await previewed({ selection: ["grill", "brief"] });

    expect(preview.counts).toStrictEqual({
      changed: 0,
      removed: 0,
      unchanged: 2,
    });
    expect(preview.selection.desired).toStrictEqual(["grill", "brief"]);
  });

  it("offers the highest release and no other", async () => {
    const preview = await previewed({
      tagNames: ["v0.3.2", "v0.3.4", "v0.3.3", "nightly"],
    });

    expect(preview.chosenRelease).toBe("v0.3.4");
  });
});

describe("UpdateTarget.preview local-copy protection", () => {
  it("asks discard consent per edited copy and overwrite consent per unverified one", async () => {
    const preview = await previewed({
      copies: { tdd: "diverged", grill: "unverifiable" },
    });

    expect(preview.localEdits.discard).toStrictEqual([
      { name: "tdd", tool: null },
    ]);
    expect(preview.localEdits.unverified).toStrictEqual([
      { name: "grill", tool: null },
    ]);
    expect(preview.copyReceipt).toMatch(/^[0-9a-f]{64}$/);
  });

  it("names the tool of every copy at risk on the global target", async () => {
    const preview = await previewed({
      target: GLOBAL,
      detected: ["claude", "codex"],
      copies: { tdd: "diverged" },
    });

    expect(preview.localEdits.discard).toStrictEqual([
      { name: "tdd", tool: "claude" },
      { name: "tdd", tool: "codex" },
    ]);
  });

  it("asks for no consent when every copy is clean", async () => {
    const preview = await previewed();

    expect(preview.localEdits).toStrictEqual({ discard: [], unverified: [] });
    expect(preview.copyReceipt).toBeNull();
  });

  it("refuses rather than price an unreadable copy", async () => {
    const result = await subject({ copies: { tdd: "unreadable" } }).preview();

    expect(result).toStrictEqual({ ok: false, error: "deployed-unreadable" });
  });

  it("refuses when the deployment record cannot be read", async () => {
    const result = await subject({
      copies: { tdd: "lockfile-malformed" },
    }).preview();

    expect(result).toStrictEqual({ ok: false, error: "lockfile-malformed" });
  });
});

describe("UpdateTarget.preview refusals", () => {
  it("refuses an unregistered repository", async () => {
    const result = await subject({ registered: false }).preview();

    expect(result).toStrictEqual({ ok: false, error: "repo-not-registered" });
  });

  it("refuses a target that follows no release", async () => {
    const result = await subject({ selection: null }).preview();

    expect(result).toStrictEqual({ ok: false, error: "not-deployed" });
  });

  it("refuses a global target no supported tool is installed for", async () => {
    const result = await subject({ target: GLOBAL, detected: [] }).preview();

    expect(result).toStrictEqual({ ok: false, error: "no-supported-tool" });
  });

  it("refuses when no Harness is connected", async () => {
    const result = await subject({ root: undefined }).preview();

    expect(result).toStrictEqual({
      ok: false,
      error: "inventory-not-configured",
    });
  });

  it("refuses when the Harness tags cannot be read", async () => {
    const result = await subject({ tagNames: null }).preview();

    expect(result).toStrictEqual({ ok: false, error: "inventory-unreadable" });
  });

  it("refuses when the Harness holds no release to move to", async () => {
    const result = await subject({ tagNames: ["nightly"] }).preview();

    expect(result).toStrictEqual({ ok: false, error: "no-published-tag" });
  });

  it("refuses rather than guess when a release tree cannot be read", async () => {
    const result = await subject({
      treesAt: (tag) => (tag === "v0.3.4" ? null : (TREES[tag] ?? null)),
    }).preview();

    expect(result).toStrictEqual({ ok: false, error: "inventory-unreadable" });
  });
});

describe("UpdateTarget preflight token", () => {
  it("proves the priced update it was minted for", async () => {
    const { update, preview } = subject();
    const answer = await preview();
    if (!answer.ok) {
      throw new Error("preview refused");
    }

    expect(
      update.accepts(
        {
          target: REPO,
          chosenRelease: "v0.3.4",
          current: SELECTION,
          desired: ["tdd", "grill", "jobs", "brief"],
          tools: [],
          copies: CLEAN_COPIES,
        },
        answer.preview.token,
      ),
    ).toBe(true);
  });

  it("retires when the chosen release, either Selection or the tools change", async () => {
    const { update, preview } = subject();
    const answer = await preview();
    if (!answer.ok) {
      throw new Error("preview refused");
    }
    const scope = {
      target: REPO,
      chosenRelease: "v0.3.4",
      current: SELECTION,
      desired: ["tdd", "grill", "jobs", "brief"],
      tools: [],
      copies: CLEAN_COPIES,
    };
    const token = answer.preview.token;

    expect(update.accepts({ ...scope, chosenRelease: "v0.3.5" }, token)).toBe(
      false,
    );
    expect(update.accepts({ ...scope, current: ["tdd"] }, token)).toBe(false);
    expect(update.accepts({ ...scope, desired: ["tdd"] }, token)).toBe(false);
    expect(update.accepts({ ...scope, tools: ["claude"] }, token)).toBe(false);
    expect(update.accepts({ ...scope, target: GLOBAL }, token)).toBe(false);
  });

  it("retires when the content it priced changed", async () => {
    const { update, preview } = subject({ copies: { tdd: "diverged" } });
    const answer = await preview();
    if (!answer.ok) {
      throw new Error("preview refused");
    }

    expect(
      update.accepts(
        {
          target: REPO,
          chosenRelease: "v0.3.4",
          current: SELECTION,
          desired: ["tdd", "grill", "jobs", "brief"],
          tools: [],
          copies: CLEAN_COPIES,
        },
        answer.preview.token,
      ),
    ).toBe(false);
  });

  it("refuses a token nobody minted", async () => {
    const { update } = subject();

    expect(
      update.accepts(
        {
          target: REPO,
          chosenRelease: "v0.3.4",
          current: SELECTION,
          desired: SELECTION,
          tools: [],
          copies: CLEAN_COPIES,
        },
        "0".repeat(64),
      ),
    ).toBe(false);
  });
});
