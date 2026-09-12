import { describe, expect, it } from "vitest";
import type { HarnessTag } from "../harness/read-harness-state";
import type { HarnessSkillTree } from "../harness/skill-movements";
import type { DeployedContentState, DeployTarget } from "./deploy-skill";
import type { SupportedTool } from "./deploy-tools";
import { InFlightLocks } from "./in-flight-locks";
import { LocalCopyGuard } from "./local-copy-guard";
import { selectionWorld } from "./selection-writer-fake";
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
  // The release that appears between preview and confirm.
  "v0.3.5": trees({
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
  digest: null,
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
  // Read after apm ran, where the disk cannot answer for itself.
  copiesAfter?: Record<string, DeployedContentState>;
  // The skill the Inventory's entrance asks for beside the release move (#955).
  add?: string;
  // What the copies read as byte for byte, re-read on every check.
  bytes?: () => string | null;
};

const HARNESS = "fimoklei/harness";
const TREE_ROOT = "/target";

function subject(options: Options = {}) {
  const world = selectionWorld({ harness: HARNESS, treeRoot: TREE_ROOT });
  // `selection: null` leaves the world unseeded: no lockfile is a target that
  // follows no release, which is what the reading answers with.
  if (options.selection !== null) {
    world.seed({
      release: options.release ?? "v0.3.2",
      skills: [...(options.selection ?? SELECTION)],
    });
  }
  const locks = new InFlightLocks();
  // Before the write the recorded baseline decides, which is what the guard
  // reads; afterwards the disk and the deployment record do.
  const classify = async (input: { name: string; release?: string }) => {
    if (world.calls.length === 0) {
      return options.copies?.[input.name] ?? "clean";
    }
    const forced = options.copiesAfter?.[input.name];
    if (forced !== undefined) {
      return forced;
    }
    if (
      !world.files.has(`${TREE_ROOT}/.claude/skills/${input.name}/SKILL.md`)
    ) {
      return "not-deployed" as const;
    }
    const lockfile = world.files.get(`${TREE_ROOT}/apm.lock.yaml`) ?? "";
    return lockfile.includes(`resolved_ref: ${input.release}`)
      ? ("clean" as const)
      : ("diverged" as const);
  };
  const update = new UpdateTarget({
    selection: world.writer,
    deployedContent: { classify },
    canonicalPath: async (path) => path,
    locks,
    registry: { isRegistered: async () => options.registered ?? true },
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
        classify,
        contentDigest: async () => options.bytes?.() ?? null,
      },
    }),
  });
  const target = options.target ?? REPO;
  const add = options.add === undefined ? {} : { add: options.add };
  return {
    update,
    world,
    locks,
    preview: () => update.preview({ target, ...add }),
    run: (input: {
      token: string;
      add?: string;
      confirmedCopyReceipt?: string;
    }) => update.run({ target, ...add, ...input }),
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

  it("refuses to price an update when the connected Harness has no usable origin", async () => {
    const result = await subject({ origin: null }).preview();

    expect(result).toStrictEqual({
      ok: false,
      error: "inventory-origin-unavailable",
    });
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

// The Inventory's entrance: the reader asked for one skill the target's own
// release does not hold, so the release move and the addition are priced
// together (#955).
describe("UpdateTarget.preview with a requested skill", () => {
  it("names the requested skill and adds it to the desired Selection", async () => {
    const preview = await previewed({ add: "wizard" });

    expect(preview.addedByThisDeploy).toStrictEqual([
      {
        name: "wizard",
        url: "https://github.com/fimoklei/harness/tree/v0.3.4/.apm/skills/wizard",
      },
    ]);
    expect(preview.selection.desired).toStrictEqual([
      "tdd",
      "grill",
      "jobs",
      "brief",
      "wizard",
    ]);
  });

  it("keeps the counting sentence over the Selection the target already holds", async () => {
    const preview = await previewed({ add: "wizard" });

    expect(preview.counts).toStrictEqual({
      changed: 2,
      removed: 1,
      unchanged: 2,
    });
    expect(preview.newInRelease.map((row) => row.name)).toStrictEqual([]);
  });

  it("adds nothing when the requested skill is already selected", async () => {
    const preview = await previewed({ add: "grill" });

    expect(preview.addedByThisDeploy).toStrictEqual([]);
    expect(preview.selection.desired).toStrictEqual([
      "tdd",
      "grill",
      "jobs",
      "brief",
    ]);
  });

  it("refuses a requested skill the chosen release removed", async () => {
    const result = await subject({ add: "review" }).preview();

    expect(result).toStrictEqual({ ok: false, error: "skill-not-in-release" });
  });

  it("refuses a requested skill no release holds", async () => {
    const result = await subject({ add: "nothing-here" }).preview();

    expect(result).toStrictEqual({ ok: false, error: "skill-not-in-release" });
  });

  it("asks consent for a copy in the way of the skill it would add", async () => {
    const preview = await previewed({
      add: "wizard",
      copies: { wizard: "diverged" },
    });

    expect(preview.localEdits.discard).toStrictEqual([
      { name: "wizard", tool: null },
    ]);
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

  it("refuses a deployment record whose Harness entry names no release", async () => {
    const world = subject();
    world.world.files.set(
      `${TREE_ROOT}/apm.lock.yaml`,
      `dependencies:
- repo_url: ${HARNESS}
  host: github.com
  resolved_ref: main
  package_type: apm_package
`,
    );

    expect(await world.preview()).toStrictEqual({
      ok: false,
      error: "ref-unresolvable",
    });
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

  it("refuses the confirm when a blocked copy was edited again after pricing", async () => {
    let body = "first edit";
    const { preview, run } = subject({
      copies: { tdd: "diverged" },
      bytes: () => body,
    });
    const answer = await preview();
    if (!answer.ok) {
      throw new Error("preview refused");
    }
    const receipt = answer.preview.copyReceipt ?? undefined;

    body = "second edit";
    await expect(
      run({ token: answer.preview.token, confirmedCopyReceipt: receipt }),
    ).resolves.toMatchObject({ ok: false, error: "status-out-of-date" });
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

// The confirm: what the reader saw, re-read under the target lock and written
// through the one Selection lifecycle (#954).
async function confirmed(options: Options = {}) {
  const running = subject(options);
  const answer = await running.preview();
  if (!answer.ok) {
    throw new Error(`preview refused: ${answer.error}`);
  }
  return { ...running, token: answer.preview.token, preview: answer.preview };
}

describe("UpdateTarget.run", () => {
  it("moves the whole Selection to the chosen release and states one outcome per skill", async () => {
    const running = await confirmed();

    const result = await running.run({ token: running.token });

    expect(result).toStrictEqual({
      ok: true,
      release: "v0.3.4",
      outcome: [
        { name: "tdd", tool: null, state: "updated" },
        { name: "grill", tool: null, state: "updated" },
        { name: "jobs", tool: null, state: "updated" },
        { name: "review", tool: null, state: "removed" },
        { name: "brief", tool: null, state: "updated" },
      ],
    });
    expect(running.world.files.get("/target/apm.yml")).toContain("- brief");
    expect(running.world.files.get("/target/apm.yml")).not.toContain("review");
  });

  it("names the tool on every outcome row of the global target", async () => {
    const running = await confirmed({
      target: GLOBAL,
      detected: ["claude", "codex"],
    });

    const result = await running.run({ token: running.token });

    expect(result.ok).toBe(true);
    expect(result.ok ? result.outcome.slice(0, 2) : []).toStrictEqual([
      { name: "tdd", tool: "claude", state: "updated" },
      { name: "tdd", tool: "codex", state: "updated" },
    ]);
    expect(running.world.calls[0]?.tools).toStrictEqual(["claude", "codex"]);
  });

  it("ends Empty through the named uninstall when the release removes every selected skill", async () => {
    const running = await confirmed({
      selection: ["review"],
      treesAt: (tag) => (tag === "v0.3.2" ? (TREES["v0.3.2"] ?? []) : []),
    });

    const result = await running.run({ token: running.token });

    expect(result).toStrictEqual({
      ok: true,
      release: "v0.3.4",
      outcome: [{ name: "review", tool: null, state: "removed" }],
    });
    expect(running.world.calls.map((call) => call.command)).toStrictEqual([
      "uninstall",
    ]);
  });

  it("keeps the operation and states what did not land when the install is partial", async () => {
    const running = await confirmed();
    running.world.landsOnly(["tdd"]);

    const result = await running.run({ token: running.token });

    expect(result.ok).toBe(false);
    expect(result.ok ? null : result.error).toBe("update-incomplete");
    expect(result.ok ? [] : (result.outcome ?? [])).toStrictEqual([
      { name: "tdd", tool: null, state: "updated" },
      { name: "grill", tool: null, state: "not-updated" },
      { name: "jobs", tool: null, state: "not-updated" },
      { name: "review", tool: null, state: "removed" },
      { name: "brief", tool: null, state: "not-updated" },
    ]);
    expect(await running.world.operations.read("/repo")).toMatchObject({
      kind: "update",
      release: "v0.3.4",
      desired: ["tdd", "grill", "jobs", "brief"],
    });
  });

  // A copy equal to its own record proves only that the two agree: which
  // release the record names is the other half of "updated" (#954).
  it("claims no skill moved while the record still names the old release", async () => {
    const running = await confirmed({ copiesAfter: { tdd: "clean" } });
    running.world.refuseWith({ ok: false, reason: "failed" });

    const result = await running.run({ token: running.token });

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : (result.outcome ?? [])).toContainEqual({
      name: "tdd",
      tool: null,
      state: "not-updated",
    });
  });

  it("claims nothing about a copy it could not read back", async () => {
    const running = await confirmed({ copiesAfter: { grill: "unreadable" } });

    const result = await running.run({ token: running.token });

    expect(result.ok ? result.outcome : []).toContainEqual({
      name: "grill",
      tool: null,
      state: "unknown",
    });
  });

  it("refuses a token minted before a newer release appeared", async () => {
    const options: Options = {};
    const running = await confirmed(options);
    options.tagNames = ["v0.3.2", "v0.3.4", "v0.3.5"];

    const result = await running.run({ token: running.token });

    expect(result.ok ? null : result.error).toBe("status-out-of-date");
    expect(running.world.calls).toStrictEqual([]);
  });

  it("refuses a token minted before the copy on disk changed", async () => {
    const options: Options = {};
    const running = await confirmed(options);
    options.copies = { tdd: "diverged" };

    const result = await running.run({ token: running.token });

    expect(result.ok ? null : result.error).toBe("status-out-of-date");
    expect(running.world.calls).toStrictEqual([]);
  });

  it("asks for consent before it overwrites an edited copy, and takes it once", async () => {
    const running = await confirmed({ copies: { tdd: "diverged" } });

    const refused = await running.run({ token: running.token });
    expect(refused.ok ? null : refused.error).toBe(
      "deployed-diverged-from-lock",
    );
    expect(running.world.calls).toStrictEqual([]);

    const receipt = refused.ok ? undefined : refused.copyReceipt;
    const result = await running.run({
      token: running.token,
      confirmedCopyReceipt: receipt,
    });
    expect(result.ok).toBe(true);
  });

  it("writes nothing when the preflight refuses", async () => {
    const running = await confirmed();

    const result = await subject({ registered: false }).run({
      token: running.token,
    });

    expect(result.ok ? null : result.error).toBe("repo-not-registered");
    expect(running.world.calls).toStrictEqual([]);
  });

  it("refuses while an earlier change on the target has not finished", async () => {
    const running = await confirmed();
    await running.world.operations.begin({
      key: "/repo",
      target: REPO,
      harness: HARNESS,
      kind: "deploy",
      release: "v0.3.2",
      previous: [],
      desired: ["tdd"],
      tools: null,
    });

    const result = await running.run({ token: running.token });

    expect(result.ok ? null : result.error).toBe("operation-unfinished");
    expect(running.world.calls).toStrictEqual([]);
  });

  it("adopts the release and adds the requested skill in one act", async () => {
    const running = await confirmed({ add: "wizard" });

    const result = await running.run({ token: running.token, add: "wizard" });

    expect(result).toStrictEqual({
      ok: true,
      release: "v0.3.4",
      outcome: [
        { name: "tdd", tool: null, state: "updated" },
        { name: "grill", tool: null, state: "updated" },
        { name: "jobs", tool: null, state: "updated" },
        { name: "review", tool: null, state: "removed" },
        { name: "brief", tool: null, state: "updated" },
        { name: "wizard", tool: null, state: "updated" },
      ],
    });
    expect(running.world.calls[0]?.skills).toContain("wizard");
    expect(running.world.files.get("/target/apm.yml")).toContain("- wizard");
  });

  it("refuses to add a skill while a write is running on the same target", async () => {
    const running = await confirmed({ add: "wizard" });

    const held = await running.locks.run("/repo", async () =>
      running.run({ token: running.token, add: "wizard" }),
    );

    expect(held.ok ? (held.value.ok ? null : held.value.error) : null).toBe(
      "update-in-progress",
    );
  });

  it("refuses a token minted without the requested skill", async () => {
    const running = await confirmed();

    const result = await running.run({ token: running.token, add: "wizard" });

    expect(result.ok ? null : result.error).toBe("status-out-of-date");
    expect(running.world.calls).toStrictEqual([]);
  });

  it("refuses a requested skill the chosen release does not hold, writing nothing", async () => {
    const running = await confirmed({ add: "wizard" });

    const result = await running.run({ token: running.token, add: "review" });

    expect(result.ok ? null : result.error).toBe("skill-not-in-release");
    expect(running.world.calls).toStrictEqual([]);
  });

  it("asks consent through this entrance too before it overwrites an edited copy", async () => {
    const running = await confirmed({
      add: "wizard",
      copies: { wizard: "diverged" },
    });

    const refused = await running.run({ token: running.token, add: "wizard" });
    expect(refused.ok ? null : refused.error).toBe(
      "deployed-diverged-from-lock",
    );
    expect(running.world.calls).toStrictEqual([]);

    const result = await running.run({
      token: running.token,
      add: "wizard",
      ...(refused.ok ? {} : { confirmedCopyReceipt: refused.copyReceipt }),
    });
    expect(result.ok).toBe(true);
  });

  it("refuses a second write while one is running on the same target", async () => {
    const running = await confirmed();

    const held = await running.locks.run("/repo", async () =>
      running.run({ token: running.token }),
    );

    expect(held.ok ? (held.value.ok ? null : held.value.error) : null).toBe(
      "update-in-progress",
    );
  });
});
