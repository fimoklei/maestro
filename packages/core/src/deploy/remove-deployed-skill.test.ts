import { describe, expect, it } from "vitest";
import type { DeployedContentState, DeployTarget } from "./deploy-skill";
import type { SupportedTool } from "./deploy-tools";
import type { DeployedRefLookup } from "./deployed-ref";
import { InFlightLocks } from "./in-flight-locks";
import {
  RemoveDeployedSkill,
  type RemoveToolCheck,
  type RemoveWarning,
} from "./remove-deployed-skill";

const VERSION = "v0.5.1";
const REF = `github.com/fimoklei/agent-harness/.apm/skills/tdd#${VERSION}`;

// The scope a successful removal reports: the tools it actually ran against,
// never the set the caller had in view.
const REPO_SCOPE = { kind: "repo" } as const;
const GLOBAL_SCOPE = { kind: "global", tools: ["claude", "codex"] } as const;
const CODEX_SCOPE = { kind: "global", tools: ["codex"] } as const;

// The removal request the cockpit sends for the row's own skill and repo.
const removeTdd = {
  type: "skill",
  name: "tdd",
  target: { kind: "repo", repoPath: "/repo" } as DeployTarget,
};

// The same request against the user scope: one action for every detected tool,
// carrying no path at all (ADR-0011, #338).
const removeTddGlobally = {
  type: "skill",
  name: "tdd",
  target: { kind: "global" } as DeployTarget,
};

// The answer a repo preflight gives when there is nothing to reclaim, which is
// every case except the leftover-copy ones. Built in one place so widening the
// result does not mean re-editing a dozen assertions.
const preflightOk = (warning: RemoveWarning | null) => ({
  ok: true,
  check: { scope: "repo", warning },
  reclaim: null,
  receipt: expect.any(String),
});

// The same, on the scope that answers per detected tool rather than once for
// the set.
const globalPreflightOk = (tools: RemoveToolCheck[]) => ({
  ok: true,
  check: { scope: "global", tools },
  reclaim: null,
  receipt: expect.any(String),
});

type Overrides = {
  registered?: boolean;
  lookup?: DeployedRefLookup;
  removed?: boolean;
  locks?: InFlightLocks;
  canonicalPath?: (path: string) => Promise<string>;
  deployedState?: DeployedContentState;
  // The guard's answer as a function of the scope it was given, for a test that
  // cares about which copies were looked at rather than a fixed verdict.
  deployedStateForScope?: (
    tools: readonly SupportedTool[] | undefined,
  ) => DeployedContentState;
  detectedTools?: SupportedTool[];
  detectTools?: () => Promise<SupportedTool[]>;
  cleanupFails?: boolean;
  // The guard's answer once apm has already run, so a test can hand the probe a
  // different disk from the one the pre-apm guard read.
  probe?: (
    tools: readonly SupportedTool[] | undefined,
  ) => Promise<DeployedContentState>;
  // Where the deployed tree sits, for the reclaim preview's paths. A fixed
  // fake root by default so a test that does not care about paths still gets
  // deterministic ones.
  treeRoot?: (target: DeployTarget) => string;
};

// The calls that reached the outside world, so a test can prove a refusal
// happened before apm — and before the lockfile — was ever touched.
function buildUseCase(overrides: Overrides = {}) {
  const calls: {
    lookups: string[];
    removes: { target: DeployTarget; ref: string }[];
    classifies: { target: DeployTarget; tools?: readonly SupportedTool[] }[];
    cleanups: {
      target: DeployTarget;
      name: string;
      tools: readonly SupportedTool[];
    }[];
  } = { lookups: [], removes: [], classifies: [], cleanups: [] };
  const useCase = new RemoveDeployedSkill({
    registry: { isRegistered: async () => overrides.registered ?? true },
    deployedRef: {
      resolve: async ({ name }) => {
        calls.lookups.push(name);
        return overrides.lookup ?? { ok: true, ref: REF, version: VERSION };
      },
    },
    deployedContent: {
      classify: async ({ target, tools }) => {
        calls.classifies.push({ target, tools });
        if (calls.removes.length > 0 && overrides.probe !== undefined) {
          return overrides.probe(tools);
        }
        return (
          overrides.deployedStateForScope?.(tools) ??
          overrides.deployedState ??
          "clean"
        );
      },
    },
    apm: {
      removeSkill: async ({ target, ref }) => {
        calls.removes.push({ target, ref });
        return (overrides.removed ?? true) ? { ok: true } : { ok: false };
      },
    },
    deployedCleanup: {
      removeSkillTargets: async (input) => {
        calls.cleanups.push(input);
        if (overrides.cleanupFails) {
          throw new Error("permission denied");
        }
      },
    },
    toolPresence: {
      detectGlobalTools:
        overrides.detectTools ??
        (async () => overrides.detectedTools ?? ["claude", "codex"]),
    },
    canonicalPath: overrides.canonicalPath ?? (async (path) => path),
    locks: overrides.locks ?? new InFlightLocks(),
    location: { treeRoot: overrides.treeRoot ?? (() => "/home") },
  });
  return { useCase, calls };
}

// The receipt the cockpit gets from its own preflight and echoes back. Taken
// from the use-case rather than hand-built, so no test can mint one the
// implementation would never issue.
async function receiptFor(
  useCase: RemoveDeployedSkill,
  request: { type: string; name: string; target: DeployTarget },
) {
  const preflight = await useCase.preflight(request);
  return preflight.ok ? preflight.receipt : undefined;
}

// The pair the cockpit drives: price the removal, then run it at the cost that
// was priced. Every removal needs its own preflight's receipt (#364), so a test
// about anything else goes through both halves rather than restating consent.
async function confirmedExecute(
  useCase: RemoveDeployedSkill,
  request: {
    type: string;
    name: string;
    target: DeployTarget;
    confirmedReclaimToken?: string;
  },
) {
  return useCase.execute({
    ...request,
    confirmedRemovalReceipt: await receiptFor(useCase, request),
  });
}

describe("RemoveDeployedSkill", () => {
  it("hands apm the tag-pinned ref the lockfile records", async () => {
    const { useCase, calls } = buildUseCase();

    await expect(confirmedExecute(useCase, removeTdd)).resolves.toEqual({
      ok: true,
      removed: {
        type: "skill",
        name: "tdd",
        version: VERSION,
        scope: REPO_SCOPE,
      },
    });
    expect(calls.removes).toEqual([{ target: removeTdd.target, ref: REF }]);
  });

  // The version the cockpit shows on the row can be stale by the time the user
  // confirms. What the removal reports as gone is the version it actually aimed
  // apm at, read from the lockfile in the same breath as the ref (#383).
  it("reports the version it removed, not the one the caller had in view", async () => {
    const { useCase } = buildUseCase({
      lookup: {
        ok: true,
        ref: "github.com/fimoklei/agent-harness/.apm/skills/tdd#v0.9.0",
        version: "v0.9.0",
      },
    });

    await expect(confirmedExecute(useCase, removeTdd)).resolves.toEqual({
      ok: true,
      removed: {
        type: "skill",
        name: "tdd",
        version: "v0.9.0",
        scope: { kind: "repo" },
      },
    });
  });

  // The screen names a tool set when it asks for consent, but the set is probed
  // live at execution time. What the removal reports as its scope is the set it
  // actually ran against, so nothing can certify tools apm never saw (#383).
  it("reports the detected tools a global removal ran against", async () => {
    const { useCase } = buildUseCase({ detectedTools: ["claude"] });

    await expect(confirmedExecute(useCase, removeTddGlobally)).resolves.toEqual(
      {
        ok: true,
        removed: {
          type: "skill",
          name: "tdd",
          version: VERSION,
          scope: { kind: "global", tools: ["claude"] },
        },
      },
    );
  });

  it("refuses a primitive type other than a skill", async () => {
    const { useCase, calls } = buildUseCase();

    await expect(
      useCase.execute({ ...removeTdd, type: "hook" }),
    ).resolves.toEqual({ ok: false, error: "unsupported-primitive-type" });
    expect(calls.removes).toEqual([]);
  });

  it("refuses a name that is not a lowercase slug", async () => {
    const { useCase, calls } = buildUseCase();

    await expect(
      useCase.execute({ ...removeTdd, name: "../../etc" }),
    ).resolves.toEqual({ ok: false, error: "invalid-name" });
    expect(calls.removes).toEqual([]);
  });

  it("refuses a repo that is not registered, before reading anything", async () => {
    const { useCase, calls } = buildUseCase({ registered: false });

    await expect(useCase.execute(removeTdd)).resolves.toEqual({
      ok: false,
      error: "repo-not-registered",
    });
    expect(calls.lookups).toEqual([]);
    expect(calls.removes).toEqual([]);
  });

  it("reports a skill the target does not carry as not deployed", async () => {
    const { useCase, calls } = buildUseCase({
      lookup: { ok: false, reason: "not-deployed" },
    });

    await expect(useCase.execute(removeTdd)).resolves.toEqual({
      ok: false,
      error: "not-deployed",
    });
    expect(calls.removes).toEqual([]);
  });

  it("surfaces a malformed lockfile instead of removing blind", async () => {
    const { useCase, calls } = buildUseCase({
      lookup: { ok: false, reason: "lockfile-malformed" },
    });

    await expect(useCase.execute(removeTdd)).resolves.toEqual({
      ok: false,
      error: "lockfile-malformed",
    });
    expect(calls.removes).toEqual([]);
  });

  it("refuses when the ref cannot be rebuilt from the lockfile entry", async () => {
    const { useCase, calls } = buildUseCase({
      lookup: { ok: false, reason: "ref-unresolvable" },
    });

    await expect(useCase.execute(removeTdd)).resolves.toEqual({
      ok: false,
      error: "ref-unresolvable",
    });
    expect(calls.removes).toEqual([]);
  });

  // apm deletes a deployed file with local edits silently and reports nothing
  // (apm-behavior.md § Remove). Destruction is this use-case's intent, not a
  // side effect, so the guard states the consequence up front through
  // `preflight` and then lets a confirmed removal through — the asymmetry with
  // deploy and update, which refuse (#337).

  // apm 0.29.0 keeps an edited or added file and aborts — after deleting the
  // rest of the copy (apm-behavior.md § Remove). So the guard refuses in front
  // of apm, as deploy and update already do (#775).
  it("refuses a copy with local edits before apm runs", async () => {
    const { useCase, calls } = buildUseCase({ deployedState: "diverged" });

    await expect(useCase.execute(removeTdd)).resolves.toEqual({
      ok: false,
      error: "deployed-diverged-from-lock",
    });
    expect(calls.removes).toEqual([]);
  });

  it("removes a copy whose edits cannot be checked once the user has confirmed", async () => {
    const { useCase, calls } = buildUseCase({ deployedState: "unverifiable" });
    const confirmedRemovalReceipt = await receiptFor(useCase, removeTdd);

    await expect(
      useCase.execute({ ...removeTdd, confirmedRemovalReceipt }),
    ).resolves.toEqual({
      ok: true,
      removed: {
        type: "skill",
        name: "tdd",
        version: VERSION,
        scope: REPO_SCOPE,
      },
    });
    expect(calls.removes).toEqual([{ target: removeTdd.target, ref: REF }]);
  });

  // Consent is proven, not taken on the caller's word: a request that carries
  // no receipt from this server's own preflight is one nobody can show the
  // warning for (#458). A copy with no baseline to compare against is not a
  // clean one: nothing rules out local work, so it is priced and proven under
  // its own wording, which never claims edits we did not see (J04).
  it("refuses a copy whose edits cannot be ruled out when nothing proves the cost was stated", async () => {
    const { useCase, calls } = buildUseCase({ deployedState: "unverifiable" });

    await expect(useCase.execute(removeTdd)).resolves.toEqual({
      ok: false,
      error: "cost-not-acknowledged",
      check: { scope: "repo", warning: "cannot-verify-local-edits" },
      receipt: expect.any(String),
      reclaim: null,
    });
    expect(calls.removes).toEqual([]);
  });

  it("refuses a receipt a caller merely guessed", async () => {
    const { useCase, calls } = buildUseCase({ deployedState: "unverifiable" });

    await expect(
      useCase.execute({
        ...removeTdd,
        confirmedRemovalReceipt: "a".repeat(64),
      }),
    ).resolves.toMatchObject({ ok: false, error: "cost-not-acknowledged" });
    expect(calls.removes).toEqual([]);
  });

  it("refuses a receipt priced for a different skill", async () => {
    const { useCase, calls } = buildUseCase({ deployedState: "unverifiable" });
    const otherSkill = await receiptFor(useCase, {
      ...removeTdd,
      name: "jobs",
    });

    await expect(
      useCase.execute({ ...removeTdd, confirmedRemovalReceipt: otherSkill }),
    ).resolves.toMatchObject({ ok: false, error: "cost-not-acknowledged" });
    expect(calls.removes).toEqual([]);
  });

  it("refuses a receipt priced for a different target", async () => {
    const { useCase, calls } = buildUseCase({ deployedState: "unverifiable" });
    const otherTarget = await receiptFor(useCase, removeTddGlobally);

    await expect(
      useCase.execute({ ...removeTdd, confirmedRemovalReceipt: otherTarget }),
    ).resolves.toMatchObject({ ok: false, error: "cost-not-acknowledged" });
    expect(calls.removes).toEqual([]);
  });

  it("refuses the global copy's local edits on the same terms", async () => {
    const { useCase, calls } = buildUseCase({ deployedState: "diverged" });

    await expect(useCase.execute(removeTddGlobally)).resolves.toEqual({
      ok: false,
      error: "deployed-diverged-from-lock",
    });
    expect(calls.removes).toEqual([]);
  });

  it("refuses a deployed copy it cannot read", async () => {
    const { useCase, calls } = buildUseCase({ deployedState: "unreadable" });

    await expect(useCase.execute(removeTdd)).resolves.toEqual({
      ok: false,
      error: "deployed-unreadable",
    });
    expect(calls.removes).toEqual([]);
  });

  it("refuses when the lockfile the guard reads does not parse", async () => {
    const { useCase, calls } = buildUseCase({
      deployedState: "lockfile-malformed",
    });

    await expect(useCase.execute(removeTdd)).resolves.toEqual({
      ok: false,
      error: "lockfile-malformed",
    });
    expect(calls.removes).toEqual([]);
  });

  it("removes a copy the guard found untouched on disk", async () => {
    const { useCase, calls } = buildUseCase({ deployedState: "not-deployed" });

    // Nothing on disk to protect: the lockfile entry exists (the ref resolved),
    // but no deployed copy does. Removing it is exactly the tidy-up the user
    // asked for.
    await expect(confirmedExecute(useCase, removeTdd)).resolves.toEqual({
      ok: true,
      removed: {
        type: "skill",
        name: "tdd",
        version: VERSION,
        scope: REPO_SCOPE,
      },
    });
    expect(calls.removes).toEqual([{ target: removeTdd.target, ref: REF }]);
  });

  it("fails closed when apm did not prove the removal", async () => {
    const { useCase } = buildUseCase({ removed: false });

    await expect(confirmedExecute(useCase, removeTdd)).resolves.toMatchObject({
      ok: false,
      error: "remove-failed",
    });
  });

  it("owns an apm driver that throws, never leaking it as a rejection", async () => {
    const useCase = new RemoveDeployedSkill({
      registry: { isRegistered: async () => true },
      deployedRef: {
        resolve: async () => ({ ok: true, ref: REF, version: VERSION }),
      },
      deployedContent: { classify: async () => "clean" },
      apm: {
        removeSkill: async () => {
          throw new Error("apm exploded");
        },
      },
      deployedCleanup: { removeSkillTargets: async () => undefined },
      toolPresence: { detectGlobalTools: async () => ["claude"] },
      canonicalPath: async (path) => path,
      locks: new InFlightLocks(),
      location: { treeRoot: () => "/home" },
    });

    await expect(confirmedExecute(useCase, removeTdd)).resolves.toEqual({
      ok: false,
      error: "remove-failed",
    });
  });

  it("refuses while another apm write to the same repo is in flight", async () => {
    const locks = new InFlightLocks();
    const { useCase } = buildUseCase({ locks });

    // A deploy already holds this repo's key: the two use-cases share one lock,
    // so a remove cannot rewrite the same apm.lock.yaml underneath it.
    const held = locks.run("/repo", () => new Promise<void>(() => undefined));
    void held;

    await expect(useCase.execute(removeTdd)).resolves.toEqual({
      ok: false,
      error: "remove-in-progress",
    });
  });

  it("locks on the canonical path, so a symlinked spelling cannot sidestep it", async () => {
    const locks = new InFlightLocks();
    const { useCase } = buildUseCase({
      locks,
      canonicalPath: async () => "/real/repo",
    });

    void locks.run("/real/repo", () => new Promise<void>(() => undefined));

    await expect(
      useCase.execute({
        ...removeTdd,
        target: { kind: "repo", repoPath: "/link/to/repo" },
      }),
    ).resolves.toEqual({ ok: false, error: "remove-in-progress" });
  });
});

// Between the check and the click, an editor autosave can turn a clean copy
// into an edited one. Consent names the state it was given for, so the removal
// compares what the confirmation showed against what it now finds, and a
// difference stops it (#364). The cost of #337's warn-don't-block stance.
describe("RemoveDeployedSkill when the copy changed since it was priced", () => {
  // Clean when the confirmation priced it, changed by the time the user
  // clicked: its baseline gone, so nothing rules out local work any more.
  function racingUseCase(overrides: Overrides = {}) {
    let state: DeployedContentState = "clean";
    const built = buildUseCase({
      ...overrides,
      deployedStateForScope: () => state,
    });
    return {
      ...built,
      loseBaseline: () => (state = "unverifiable"),
      edit: () => (state = "diverged"),
    };
  }

  it("removes nothing and states the cost it found instead", async () => {
    const { useCase, calls, loseBaseline } = racingUseCase();
    const confirmedRemovalReceipt = await receiptFor(useCase, removeTdd);
    loseBaseline();

    await expect(
      useCase.execute({ ...removeTdd, confirmedRemovalReceipt }),
    ).resolves.toEqual({
      ok: false,
      error: "cost-not-acknowledged",
      check: { scope: "repo", warning: "cannot-verify-local-edits" },
      receipt: expect.any(String),
      reclaim: null,
    });
    expect(calls.removes).toEqual([]);
  });

  // An editor autosave between the check and the click is a refusal, not a
  // restated price: there is no consent that lets apm at an edited copy (#775).
  it("refuses outright when the copy gained local edits since it was priced", async () => {
    const { useCase, calls, edit } = racingUseCase();
    const confirmedRemovalReceipt = await receiptFor(useCase, removeTdd);
    edit();

    await expect(
      useCase.execute({ ...removeTdd, confirmedRemovalReceipt }),
    ).resolves.toEqual({ ok: false, error: "deployed-diverged-from-lock" });
    expect(calls.removes).toEqual([]);
  });

  // Not a lock: the answer carries the proof for the state it just found, so
  // confirming again goes through without pricing the removal a second time.
  it("hands back a receipt the same removal can be confirmed with", async () => {
    const { useCase, calls, loseBaseline } = racingUseCase();
    const stale = await receiptFor(useCase, removeTdd);
    loseBaseline();
    const refused = await useCase.execute({
      ...removeTdd,
      confirmedRemovalReceipt: stale,
    });

    await expect(
      useCase.execute({
        ...removeTdd,
        confirmedRemovalReceipt: refused.ok ? undefined : refused.receipt,
      }),
    ).resolves.toEqual({
      ok: true,
      removed: {
        type: "skill",
        name: "tdd",
        version: VERSION,
        scope: REPO_SCOPE,
      },
    });
    expect(calls.removes).toEqual([{ target: removeTdd.target, ref: REF }]);
  });

  // One tool's copy changing is enough: the confirmation states a cost per row,
  // so a row that no longer reads the way it did was never agreed to (#414).
  it("refuses when one tool's global copy changed and the others did not", async () => {
    let changed: SupportedTool | null = null;
    const { useCase, calls } = buildUseCase({
      detectedTools: ["claude", "codex"],
      deployedStateForScope: (tools) =>
        tools?.[0] === changed ? "unverifiable" : "clean",
    });
    const confirmedRemovalReceipt = await receiptFor(
      useCase,
      removeTddGlobally,
    );
    changed = "codex";

    await expect(
      useCase.execute({ ...removeTddGlobally, confirmedRemovalReceipt }),
    ).resolves.toEqual({
      ok: false,
      error: "cost-not-acknowledged",
      check: {
        scope: "global",
        tools: [
          { tool: "claude", warning: null },
          { tool: "codex", warning: "cannot-verify-local-edits" },
        ],
      },
      receipt: expect.any(String),
      reclaim: null,
    });
    expect(calls.removes).toEqual([]);
  });

  // The leftover copies a global removal would delete are part of the same
  // question, and the machine's tools can change between the two halves too. A
  // refusal that restated only the cost would leave the next attempt echoing a
  // token minted for a tool set that no longer exists (#390).
  it("hands back the leftover consent it found, not the one the dialog holds", async () => {
    let detected: SupportedTool[] = ["claude", "codex"];
    let changed = false;
    const { useCase, calls } = buildUseCase({
      detectTools: async () => detected,
      deployedStateForScope: (tools) =>
        changed && tools?.[0] === "codex" ? "unverifiable" : "clean",
    });
    const stale = await receiptFor(useCase, removeTddGlobally);
    // Claude Code has dropped off the machine, so its copy is now a leftover
    // apm's own uninstall will not reach — and the copy that is left has lost
    // its baseline, so the cost differs and the removal stops.
    detected = ["codex"];
    changed = true;
    const refused = await useCase.execute({
      ...removeTddGlobally,
      confirmedRemovalReceipt: stale,
    });

    expect(refused).toEqual({
      ok: false,
      error: "cost-not-acknowledged",
      check: {
        scope: "global",
        tools: [
          { tool: "codex", warning: "cannot-verify-local-edits" },
          { tool: "claude", warning: null },
        ],
      },
      receipt: expect.any(String),
      reclaim: {
        previews: [{ tool: "claude", path: "/home/.claude/skills/tdd" }],
        token: expect.any(String),
      },
    });
    // And that token is the one the retry can act on.
    await expect(
      useCase.execute({
        ...removeTddGlobally,
        confirmedRemovalReceipt: refused.ok ? undefined : refused.receipt,
        confirmedReclaimToken: refused.ok ? undefined : refused.reclaim?.token,
      }),
    ).resolves.toMatchObject({ ok: true });
    expect(calls.cleanups).toEqual([
      { target: { kind: "global" }, name: "tdd", tools: ["claude"] },
    ]);
  });

  // Nothing to compare against is not a free pass: a request that acknowledges
  // no cost is treated exactly like one that acknowledged a stale one, even
  // where the copy is clean and there is nothing to lose.
  it("refuses a removal that acknowledges no cost at all", async () => {
    const { useCase, calls } = buildUseCase({ deployedState: "clean" });

    await expect(useCase.execute(removeTdd)).resolves.toEqual({
      ok: false,
      error: "cost-not-acknowledged",
      check: { scope: "repo", warning: null },
      receipt: expect.any(String),
      reclaim: null,
    });
    expect(calls.removes).toEqual([]);
  });

  // The copy is the one the user was warned about, so the removal runs exactly
  // as it did before this guard existed.
  it("goes ahead when the copy still reads the way it was priced", async () => {
    const { useCase, calls } = buildUseCase({ deployedState: "unverifiable" });

    await expect(confirmedExecute(useCase, removeTdd)).resolves.toMatchObject({
      ok: true,
    });
    expect(calls.removes).toEqual([{ target: removeTdd.target, ref: REF }]);
  });
});

// The user scope. One action removes the skill from every detected tool, because
// apm's uninstall has no -t and the one lever that looks like per-tool scoping
// orphans the other tools' files (apm-behavior.md § Remove, ADR-0013).
describe("RemoveDeployedSkill on the global target", () => {
  it("removes the skill in one action, naming the global scope to apm", async () => {
    const { useCase, calls } = buildUseCase();

    await expect(confirmedExecute(useCase, removeTddGlobally)).resolves.toEqual(
      {
        ok: true,
        removed: {
          type: "skill",
          name: "tdd",
          version: VERSION,
          scope: GLOBAL_SCOPE,
        },
      },
    );
    expect(calls.removes).toEqual([{ target: { kind: "global" }, ref: REF }]);
  });

  it("never asks the repo registry about a request that carries no path", async () => {
    // The global scope's location is apm's own, resolved server-side, so there
    // is no client path for the registry to gate (J07).
    const { useCase, calls } = buildUseCase({ registered: false });

    await expect(confirmedExecute(useCase, removeTddGlobally)).resolves.toEqual(
      {
        ok: true,
        removed: {
          type: "skill",
          name: "tdd",
          version: VERSION,
          scope: GLOBAL_SCOPE,
        },
      },
    );
    expect(calls.removes).toHaveLength(1);
  });

  it("scans every supported tool's copy, not only the detected ones", async () => {
    // Detection answers "what does this machine have today"; apm's uninstall
    // deletes by its own recorded targets, which still name a tool that has
    // since dropped out. Scanning only the detected set would let apm delete an
    // edited copy the confirmation never mentioned. The scan therefore covers
    // every supported tool — the guard's own default (undefined). The per-tool
    // calls around it are the pricing, which answers a different question (#414).
    const { useCase, calls } = buildUseCase({ detectedTools: ["claude"] });

    await confirmedExecute(useCase, removeTddGlobally);

    expect(calls.classifies).toContainEqual({
      target: { kind: "global" },
      tools: undefined,
    });
  });

  it("refuses when the machine has no detected tool to remove from", async () => {
    // With nothing detected there is no scope to state and no copy to check, so
    // a removal could only report an outcome it never observed (J04).
    const { useCase, calls } = buildUseCase({ detectedTools: [] });

    await expect(useCase.execute(removeTddGlobally)).resolves.toEqual({
      ok: false,
      error: "no-supported-tool",
    });
    expect(calls.removes).toEqual([]);
  });

  it("refuses while another global apm write is in flight", async () => {
    const locks = new InFlightLocks();
    const { useCase } = buildUseCase({ locks });

    // A global deploy holds the user scope's own key — there is no path to
    // canonicalize, so both use-cases queue on the same literal.
    void locks.run("global", () => new Promise<void>(() => undefined));

    await expect(useCase.execute(removeTddGlobally)).resolves.toEqual({
      ok: false,
      error: "remove-in-progress",
    });
  });

  it("owns a tool probe that throws instead of removing from an unknown scope", async () => {
    const { useCase, calls } = buildUseCase({
      detectTools: async () => {
        throw new Error("home unreadable");
      },
    });

    await expect(useCase.execute(removeTddGlobally)).resolves.toEqual({
      ok: false,
      error: "remove-failed",
    });
    expect(calls.removes).toEqual([]);
  });

  it("refuses the check on a global copy with local edits just as it does per repo", async () => {
    const { useCase } = buildUseCase({ deployedState: "diverged" });

    await expect(useCase.preflight(removeTddGlobally)).resolves.toEqual({
      ok: false,
      error: "deployed-diverged-from-lock",
    });
  });

  // One tool's edited copy refuses the whole removal: apm's uninstall has no -t,
  // so it would abort on that copy after deleting the others (#775).
  it("refuses the check when only one tool's copy carries local edits", async () => {
    const { useCase } = buildUseCase({
      detectedTools: ["claude", "codex"],
      deployedStateForScope: (tools) =>
        tools?.[0] === "codex" ? "diverged" : "clean",
    });

    await expect(useCase.preflight(removeTddGlobally)).resolves.toEqual({
      ok: false,
      error: "deployed-diverged-from-lock",
    });
  });

  it("asks the check once per detected tool, scoped to that tool's copy", async () => {
    const { useCase, calls } = buildUseCase({
      detectedTools: ["claude", "codex"],
    });

    await useCase.preflight(removeTddGlobally);

    expect(calls.classifies).toEqual([
      { target: { kind: "global" }, tools: ["claude"] },
      { target: { kind: "global" }, tools: ["codex"] },
    ]);
  });

  // The confirmation states a cost on the row that carries it, so one tool's
  // edited copy may never make another tool's clean copy look edited (#414).
  it("names the cost against the tool whose copy carries it, and no other", async () => {
    const { useCase } = buildUseCase({
      detectedTools: ["claude", "codex"],
      deployedStateForScope: (tools) =>
        tools?.[0] === "codex" ? "unverifiable" : "clean",
    });

    await expect(useCase.preflight(removeTddGlobally)).resolves.toEqual(
      globalPreflightOk([
        { tool: "claude", warning: null },
        { tool: "codex", warning: "cannot-verify-local-edits" },
      ]),
    );
  });

  it("reports a tool whose check threw as unchecked, and still answers for the rest", async () => {
    // A check that could not run is never answered as a clean copy (J04), and
    // one unreadable copy must not take the other tools' answers with it.
    const { useCase } = buildUseCase({
      detectedTools: ["claude", "codex"],
      deployedStateForScope: (tools) => {
        if (tools?.[0] === "claude") {
          throw new Error("disk exploded");
        }
        return "clean";
      },
    });

    await expect(useCase.preflight(removeTddGlobally)).resolves.toEqual(
      globalPreflightOk([
        { tool: "claude", warning: "check-did-not-run" },
        { tool: "codex", warning: null },
      ]),
    );
  });

  it("refuses the check too when no tool is detected", async () => {
    const { useCase, calls } = buildUseCase({ detectedTools: [] });

    await expect(useCase.preflight(removeTddGlobally)).resolves.toEqual({
      ok: false,
      error: "no-supported-tool",
    });
    expect(calls.classifies).toEqual([]);
  });

  it("reports a tool probe that threw, never guessing the copy clean", async () => {
    const { useCase } = buildUseCase({
      detectTools: async () => {
        throw new Error("home unreadable");
      },
    });

    await expect(useCase.preflight(removeTddGlobally)).resolves.toEqual({
      ok: false,
      error: "preflight-failed",
    });
  });
});

// apm's uninstall deletes the copies for the tools its own apm.yml still lists,
// so a skill installed back when the machine had more tools leaves a tree behind
// for every tool that has since dropped off. Reclaiming those is what makes a
// global removal complete rather than complete-for-today's-tools (#339) — but
// only when the request's token proves it came from this same instance's own
// `preflight` (#390): a client-supplied path, or a guessed or stale token, can
// never authorize a reclaim.
describe("RemoveDeployedSkill cleaning up after a global remove", () => {
  // The token a real preflight against this same request would return —
  // never hand-built, so a test cannot accidentally exercise a token the
  // implementation would never actually issue.
  async function confirmedTokenFor(
    useCase: RemoveDeployedSkill,
    target: DeployTarget = removeTddGlobally.target,
  ) {
    const preflight = await useCase.preflight({ ...removeTddGlobally, target });
    return preflight.ok ? preflight.reclaim?.token : undefined;
  }

  it("reclaims the leftover copy once the request echoes back preflight's own token", async () => {
    const { useCase, calls } = buildUseCase({ detectedTools: ["codex"] });
    const confirmedReclaimToken = await confirmedTokenFor(useCase);

    await expect(
      confirmedExecute(useCase, {
        ...removeTddGlobally,
        confirmedReclaimToken,
      }),
    ).resolves.toEqual({
      ok: true,
      removed: {
        type: "skill",
        name: "tdd",
        version: VERSION,
        scope: CODEX_SCOPE,
      },
    });
    expect(calls.cleanups).toEqual([
      { target: { kind: "global" }, name: "tdd", tools: ["claude"] },
    ]);
  });

  it("reclaims nothing when no token was ever confirmed", async () => {
    // The defect #390 fixes: a leftover exists, but nothing confirmed it — so the
    // removal must not delete more than the user agreed to.
    const { useCase, calls } = buildUseCase({ detectedTools: ["codex"] });

    await expect(confirmedExecute(useCase, removeTddGlobally)).resolves.toEqual(
      {
        ok: true,
        removed: {
          type: "skill",
          name: "tdd",
          version: VERSION,
          scope: CODEX_SCOPE,
        },
      },
    );
    expect(calls.cleanups).toEqual([]);
  });

  it("reclaims nothing for a token a caller merely guessed, without ever calling preflight", async () => {
    // The exact bypass the review flagged: a direct request that echoes back
    // a plausible-looking token it never actually received from preflight.
    const { useCase, calls } = buildUseCase({ detectedTools: ["codex"] });

    await expect(
      confirmedExecute(useCase, {
        ...removeTddGlobally,
        confirmedReclaimToken: "a".repeat(64),
      }),
    ).resolves.toEqual({
      ok: true,
      removed: {
        type: "skill",
        name: "tdd",
        version: VERSION,
        scope: CODEX_SCOPE,
      },
    });
    expect(calls.cleanups).toEqual([]);
  });

  it("reclaims nothing for a token from a different machine state", async () => {
    // A stale confirmation: the token was valid for a prior detection state
    // (both tools present, nothing to reclaim), replayed against a request
    // where Claude has since dropped off. Treated as never confirmed.
    const { useCase: preflightUseCase } = buildUseCase({
      detectedTools: ["claude", "codex"],
    });
    const staleToken = await confirmedTokenFor(preflightUseCase);
    const { useCase, calls } = buildUseCase({ detectedTools: ["codex"] });

    await confirmedExecute(useCase, {
      ...removeTddGlobally,
      confirmedReclaimToken: staleToken,
    });

    expect(calls.cleanups).toEqual([]);
  });

  it("leaves a detected tool's tree to the removal itself", async () => {
    const { useCase, calls } = buildUseCase({
      detectedTools: ["claude", "codex"],
    });
    const confirmedReclaimToken = await confirmedTokenFor(useCase);

    await confirmedExecute(useCase, {
      ...removeTddGlobally,
      confirmedReclaimToken,
    });

    expect(calls.cleanups).toEqual([]);
  });

  it("keeps a skills directory several tools read, even when its tool is gone", async () => {
    // Codex is undetected, but nine other apm targets deploy under .agents. An
    // absent Codex proves nothing about them, so the copy stays (#202).
    const { useCase, calls } = buildUseCase({ detectedTools: ["claude"] });

    await confirmedExecute(useCase, removeTddGlobally);

    expect(calls.cleanups).toEqual([]);
  });

  it("reclaims nothing when the removal itself failed", async () => {
    // apm never printed its uninstall marker, so the skill may still be there.
    // Deleting a subtree now would destroy a copy no removal replaced.
    const { useCase, calls } = buildUseCase({
      detectedTools: ["codex"],
      removed: false,
    });
    const confirmedReclaimToken = await confirmedTokenFor(useCase);

    await expect(
      confirmedExecute(useCase, {
        ...removeTddGlobally,
        confirmedReclaimToken,
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: "remove-failed",
    });
    expect(calls.cleanups).toEqual([]);
  });

  it("still reports the removal successful when the leftover will not go", async () => {
    // The skill is gone; a leftover that could not be reclaimed is no worse than
    // before the removal, and is not a failed removal.
    const { useCase, calls } = buildUseCase({
      detectedTools: ["codex"],
      cleanupFails: true,
    });
    const confirmedReclaimToken = await confirmedTokenFor(useCase);

    await expect(
      confirmedExecute(useCase, {
        ...removeTddGlobally,
        confirmedReclaimToken,
      }),
    ).resolves.toEqual({
      ok: true,
      removed: {
        type: "skill",
        name: "tdd",
        version: VERSION,
        scope: CODEX_SCOPE,
      },
    });
    expect(calls.cleanups).toHaveLength(1);
  });

  it("reclaims nothing on the per-repo path", async () => {
    // A repo's targets are its own apm.yml, not this machine's tool detection.
    const { useCase, calls } = buildUseCase({ detectedTools: ["codex"] });
    const confirmedReclaimToken = await confirmedTokenFor(useCase);

    await confirmedExecute(useCase, { ...removeTdd, confirmedReclaimToken });

    expect(calls.cleanups).toEqual([]);
  });
});

// What the preflight names before the user confirms. A global
// removal may force-delete a leftover tool's whole copy; the confirmation
// must name that path by tool so the dialog can state it, and a path
// preflight could not build is dropped rather than guessed.
describe("RemoveDeployedSkill.preflight naming the reclaim", () => {
  // Which leftovers qualify, and where they sit, is RemoveConsentIssuer's own
  // rule and is tested there. What matters here is that preflight hands the
  // confirmation the whole consent — paths and token together.
  it("hands the confirmation the leftover paths together with their token", async () => {
    const { useCase } = buildUseCase({ detectedTools: ["codex"] });

    await expect(useCase.preflight(removeTddGlobally)).resolves.toEqual({
      ok: true,
      check: {
        scope: "global",
        tools: [
          { tool: "codex", warning: null },
          { tool: "claude", warning: null },
        ],
      },
      reclaim: {
        previews: [{ tool: "claude", path: "/home/.claude/skills/tdd" }],
        token: expect.any(String),
      },
      receipt: expect.any(String),
    });
  });

  it("names nothing to reclaim when every exclusive tool is still detected", async () => {
    const { useCase } = buildUseCase({ detectedTools: ["claude", "codex"] });

    await expect(useCase.preflight(removeTddGlobally)).resolves.toEqual(
      globalPreflightOk([
        { tool: "claude", warning: null },
        { tool: "codex", warning: null },
      ]),
    );
  });

  it("asks the guard about the leftover copy too, after the detected tools", async () => {
    // The reclaim deletes that copy whole, so its own row is where its cost is
    // stated — and "the whole copy goes" does not say whether what goes was
    // work nothing else holds (#414).
    const { useCase, calls } = buildUseCase({ detectedTools: ["codex"] });

    await useCase.preflight(removeTddGlobally);

    expect(calls.classifies).toEqual([
      { target: { kind: "global" }, tools: ["codex"] },
      { target: { kind: "global" }, tools: ["claude"] },
    ]);
  });

  it("names the cost inside a leftover copy the reclaim would delete", async () => {
    const { useCase } = buildUseCase({
      detectedTools: ["codex"],
      deployedStateForScope: (tools) =>
        tools?.[0] === "claude" ? "unverifiable" : "clean",
    });

    await expect(useCase.preflight(removeTddGlobally)).resolves.toEqual({
      ok: true,
      check: {
        scope: "global",
        tools: [
          { tool: "codex", warning: null },
          { tool: "claude", warning: "cannot-verify-local-edits" },
        ],
      },
      reclaim: {
        previews: [{ tool: "claude", path: "/home/.claude/skills/tdd" }],
        token: expect.any(String),
      },
      receipt: expect.any(String),
    });
  });

  // apm's lockfile still lists the leftover copy, so its uninstall would retain
  // the edited file there too and abort (#775).
  it("refuses the check when the leftover copy carries local edits", async () => {
    const { useCase } = buildUseCase({
      detectedTools: ["codex"],
      deployedStateForScope: (tools) =>
        tools?.[0] === "claude" ? "diverged" : "clean",
    });

    await expect(useCase.preflight(removeTddGlobally)).resolves.toEqual({
      ok: false,
      error: "deployed-diverged-from-lock",
    });
  });
});

// What the confirmation must say before the user destroys a deployed copy. An
// unverifiable copy is not a diverged one, and calling it "edited" would be a
// claim we cannot make (#337); a diverged copy is refused, never priced (#775).
describe("RemoveDeployedSkill.preflight", () => {
  it("refuses a copy with local edits, offering nothing to confirm", async () => {
    const { useCase, calls } = buildUseCase({ deployedState: "diverged" });

    await expect(useCase.preflight(removeTdd)).resolves.toEqual({
      ok: false,
      error: "deployed-diverged-from-lock",
    });
    // A check, not the action: nothing is removed by asking.
    expect(calls.removes).toEqual([]);
  });

  it("warns separately when there is no baseline to verify against", async () => {
    const { useCase } = buildUseCase({ deployedState: "unverifiable" });

    await expect(useCase.preflight(removeTdd)).resolves.toEqual(
      preflightOk("cannot-verify-local-edits"),
    );
  });

  it("says the copy could not be checked when it cannot be read", async () => {
    // Distinct from "no baseline recorded": there, the check ran and found
    // nothing to compare against. Here it never ran at all.
    const { useCase } = buildUseCase({ deployedState: "unreadable" });

    await expect(useCase.preflight(removeTdd)).resolves.toEqual(
      preflightOk("check-did-not-run"),
    );
  });

  it("says the same when the lockfile the check reads does not parse", async () => {
    const { useCase } = buildUseCase({ deployedState: "lockfile-malformed" });

    await expect(useCase.preflight(removeTdd)).resolves.toEqual(
      preflightOk("check-did-not-run"),
    );
  });

  it("warns about nothing when the copy still matches the lockfile", async () => {
    const { useCase } = buildUseCase({ deployedState: "clean" });

    await expect(useCase.preflight(removeTdd)).resolves.toEqual(
      preflightOk(null),
    );
  });

  it("warns about nothing when there is no copy on disk to lose", async () => {
    const { useCase } = buildUseCase({ deployedState: "not-deployed" });

    await expect(useCase.preflight(removeTdd)).resolves.toEqual(
      preflightOk(null),
    );
  });

  it("refuses an unregistered repo before reading anything", async () => {
    // A path-taking read is still a path-taking endpoint: an unregistered path
    // may not probe a lockfile through the back door (security.md).
    const classified: string[] = [];
    const useCase = new RemoveDeployedSkill({
      registry: { isRegistered: async () => false },
      deployedRef: {
        resolve: async () => ({ ok: true, ref: REF, version: VERSION }),
      },
      deployedContent: {
        classify: async ({ name }) => {
          classified.push(name);
          return "clean";
        },
      },
      apm: { removeSkill: async () => ({ ok: true }) },
      deployedCleanup: { removeSkillTargets: async () => undefined },
      toolPresence: { detectGlobalTools: async () => ["claude"] },
      canonicalPath: async (path) => path,
      locks: new InFlightLocks(),
      location: { treeRoot: () => "/home" },
    });

    await expect(useCase.preflight(removeTdd)).resolves.toEqual({
      ok: false,
      error: "repo-not-registered",
    });
    expect(classified).toEqual([]);
  });

  it("refuses a name that is not a lowercase slug", async () => {
    const { useCase } = buildUseCase();

    await expect(
      useCase.preflight({ ...removeTdd, name: "../../etc" }),
    ).resolves.toEqual({ ok: false, error: "invalid-name" });
  });

  it("refuses a primitive type other than a skill", async () => {
    const { useCase } = buildUseCase();

    await expect(
      useCase.preflight({ ...removeTdd, type: "hook" }),
    ).resolves.toEqual({ ok: false, error: "unsupported-primitive-type" });
  });

  it("reports a classification that threw, never guessing it clean", async () => {
    const useCase = new RemoveDeployedSkill({
      registry: { isRegistered: async () => true },
      deployedRef: {
        resolve: async () => ({ ok: true, ref: REF, version: VERSION }),
      },
      deployedContent: {
        classify: async () => {
          throw new Error("disk exploded");
        },
      },
      apm: { removeSkill: async () => ({ ok: true }) },
      deployedCleanup: { removeSkillTargets: async () => undefined },
      toolPresence: { detectGlobalTools: async () => ["claude"] },
      canonicalPath: async (path) => path,
      locks: new InFlightLocks(),
      location: { treeRoot: () => "/home" },
    });

    await expect(useCase.preflight(removeTdd)).resolves.toEqual({
      ok: false,
      error: "preflight-failed",
    });
  });
});

// apm's uninstall takes every tool in one call and reports one outcome for all
// of them, and narrowing its targets to fake a per-tool answer orphans the
// other tools' files (ADR-0013). So after a failure the server probes the disk
// itself and reports, per target, whether the deployed copy is still there.
describe("RemoveDeployedSkill reporting a failed removal per target", () => {
  it("reports the repo's own copy as gone when the probe finds nothing left", async () => {
    const { useCase } = buildUseCase({
      removed: false,
      probe: async () => "not-deployed",
    });

    await expect(confirmedExecute(useCase, removeTdd)).resolves.toEqual({
      ok: false,
      error: "remove-failed",
      outcome: { scope: "repo", state: "removed" },
    });
  });

  it("reports a copy still on disk as not removed", async () => {
    const { useCase } = buildUseCase({
      removed: false,
      probe: async () => "clean",
    });

    await expect(confirmedExecute(useCase, removeTdd)).resolves.toEqual({
      ok: false,
      error: "remove-failed",
      outcome: { scope: "repo", state: "not-removed" },
    });
  });

  it("answers per detected tool, so one tool's copy speaks only for itself", async () => {
    const { useCase } = buildUseCase({
      removed: false,
      detectedTools: ["claude", "codex"],
      probe: async (tools) =>
        tools?.[0] === "claude" ? "not-deployed" : "diverged",
    });

    await expect(confirmedExecute(useCase, removeTddGlobally)).resolves.toEqual(
      {
        ok: false,
        error: "remove-failed",
        outcome: {
          scope: "global",
          tools: [
            { tool: "claude", state: "removed" },
            { tool: "codex", state: "not-removed" },
          ],
        },
      },
    );
  });

  it("keeps the detected tools in the order the confirmation showed them", async () => {
    const { useCase } = buildUseCase({
      removed: false,
      detectedTools: ["codex", "claude"],
      probe: async () => "clean",
    });
    const result = await confirmedExecute(useCase, removeTddGlobally);

    expect(
      result.ok === false && result.outcome?.scope === "global"
        ? result.outcome.tools.map((entry) => entry.tool)
        : null,
    ).toEqual(["codex", "claude"]);
  });

  it("calls a probe that threw unknown, never removed", async () => {
    const { useCase } = buildUseCase({
      removed: false,
      probe: async () => {
        throw new Error("disk exploded");
      },
    });

    await expect(confirmedExecute(useCase, removeTdd)).resolves.toEqual({
      ok: false,
      error: "remove-failed",
      outcome: { scope: "repo", state: "unknown" },
    });
  });

  it("calls a copy it could not read unknown, never removed", async () => {
    for (const state of ["unreadable", "lockfile-malformed"] as const) {
      const { useCase } = buildUseCase({
        removed: false,
        probe: async () => state,
      });

      await expect(confirmedExecute(useCase, removeTdd)).resolves.toEqual({
        ok: false,
        error: "remove-failed",
        outcome: { scope: "repo", state: "unknown" },
      });
    }
  });

  it("reports nothing for a failure that never reached apm", async () => {
    // Nothing was removed, so there is no outcome to report — and a ledger here
    // would state one the server never observed.
    const { useCase, calls } = buildUseCase({
      lookup: { ok: false, reason: "not-deployed" },
    });

    await expect(confirmedExecute(useCase, removeTdd)).resolves.toEqual({
      ok: false,
      error: "not-deployed",
    });
    expect(calls.removes).toEqual([]);
  });

  it("reports nothing when the guard refused before apm ran", async () => {
    const { useCase, calls } = buildUseCase({ deployedState: "unreadable" });

    await expect(confirmedExecute(useCase, removeTdd)).resolves.toEqual({
      ok: false,
      error: "deployed-unreadable",
    });
    expect(calls.removes).toEqual([]);
  });
});
