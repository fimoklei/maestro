import { describe, expect, it } from "vitest";
import type { DeployedContentState, DeployTarget } from "./deploy-skill";
import type { SupportedTool } from "./deploy-tools";
import type { DeployedRefLookup } from "./deployed-ref";
import { InFlightLocks } from "./in-flight-locks";
import { RemoveDeployedSkill } from "./remove-deployed-skill";

const REF = "github.com/fimoklei/agent-harness/skills/tdd#v0.5.1";

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
        return overrides.lookup ?? { ok: true, ref: REF };
      },
    },
    deployedContent: {
      classify: async ({ target, tools }) => {
        calls.classifies.push({ target, tools });
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
    locks: overrides.locks,
    location: { treeRoot: overrides.treeRoot ?? (() => "/home") },
  });
  return { useCase, calls };
}

describe("RemoveDeployedSkill", () => {
  it("hands apm the tag-pinned ref the lockfile records", async () => {
    const { useCase, calls } = buildUseCase();

    await expect(useCase.execute(removeTdd)).resolves.toEqual({
      ok: true,
      removed: { type: "skill", name: "tdd" },
    });
    expect(calls.removes).toEqual([{ target: removeTdd.target, ref: REF }]);
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

  it("removes a copy with local edits once the user has confirmed", async () => {
    const { useCase, calls } = buildUseCase({ deployedState: "diverged" });

    await expect(useCase.execute(removeTdd)).resolves.toEqual({
      ok: true,
      removed: { type: "skill", name: "tdd" },
    });
    expect(calls.removes).toEqual([{ target: removeTdd.target, ref: REF }]);
  });

  it("removes a copy whose edits cannot be checked once the user has confirmed", async () => {
    const { useCase, calls } = buildUseCase({ deployedState: "unverifiable" });

    await expect(useCase.execute(removeTdd)).resolves.toEqual({
      ok: true,
      removed: { type: "skill", name: "tdd" },
    });
    expect(calls.removes).toEqual([{ target: removeTdd.target, ref: REF }]);
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
    await expect(useCase.execute(removeTdd)).resolves.toEqual({
      ok: true,
      removed: { type: "skill", name: "tdd" },
    });
    expect(calls.removes).toEqual([{ target: removeTdd.target, ref: REF }]);
  });

  it("fails closed when apm did not prove the removal", async () => {
    const { useCase } = buildUseCase({ removed: false });

    await expect(useCase.execute(removeTdd)).resolves.toEqual({
      ok: false,
      error: "remove-failed",
    });
  });

  it("owns an apm driver that throws, never leaking it as a rejection", async () => {
    const useCase = new RemoveDeployedSkill({
      registry: { isRegistered: async () => true },
      deployedRef: { resolve: async () => ({ ok: true, ref: REF }) },
      deployedContent: { classify: async () => "clean" },
      apm: {
        removeSkill: async () => {
          throw new Error("apm exploded");
        },
      },
      deployedCleanup: { removeSkillTargets: async () => undefined },
      toolPresence: { detectGlobalTools: async () => ["claude"] },
      canonicalPath: async (path) => path,
      location: { treeRoot: () => "/home" },
    });

    await expect(useCase.execute(removeTdd)).resolves.toEqual({
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

// The user scope. One action removes the skill from every detected tool, because
// apm's uninstall has no -t and the one lever that looks like per-tool scoping
// orphans the other tools' files (apm-behavior.md § Remove, ADR-0013).
describe("RemoveDeployedSkill on the global target", () => {
  it("removes the skill in one action, naming the global scope to apm", async () => {
    const { useCase, calls } = buildUseCase();

    await expect(useCase.execute(removeTddGlobally)).resolves.toEqual({
      ok: true,
      removed: { type: "skill", name: "tdd" },
    });
    expect(calls.removes).toEqual([{ target: { kind: "global" }, ref: REF }]);
  });

  it("never asks the repo registry about a request that carries no path", async () => {
    // The global scope's location is apm's own, resolved server-side, so there
    // is no client path for the registry to gate (J07).
    const { useCase, calls } = buildUseCase({ registered: false });

    await expect(useCase.execute(removeTddGlobally)).resolves.toEqual({
      ok: true,
      removed: { type: "skill", name: "tdd" },
    });
    expect(calls.removes).toHaveLength(1);
  });

  it("scans every supported tool's copy, not only the detected ones", async () => {
    // Detection answers "what does this machine have today"; apm's uninstall
    // deletes by its own recorded targets, which still name a tool that has
    // since dropped out. Scanning only the detected set would let apm delete an
    // edited copy the confirmation never mentioned. The scan therefore covers
    // every supported tool — the guard's own default (undefined).
    const { useCase, calls } = buildUseCase({ detectedTools: ["claude"] });

    await useCase.execute(removeTddGlobally);

    expect(calls.classifies).toEqual([
      { target: { kind: "global" }, tools: undefined },
    ]);
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

  it("warns about local edits on the global copy just as it does per repo", async () => {
    const { useCase } = buildUseCase({ deployedState: "diverged" });

    await expect(useCase.preflight(removeTddGlobally)).resolves.toEqual({
      ok: true,
      warning: "local-edits-will-be-lost",
      reclaim: [],
    });
  });

  it("checks every supported tool's copy before confirming", async () => {
    const { useCase, calls } = buildUseCase({ detectedTools: ["codex"] });

    await useCase.preflight(removeTddGlobally);

    expect(calls.classifies).toEqual([
      { target: { kind: "global" }, tools: undefined },
    ]);
  });

  it("warns about a copy left behind by a tool that is no longer detected", async () => {
    // The tool went away; its deployed copy did not, and apm still deletes it.
    // A check scoped to today's tools would call this removal costless.
    const { useCase } = buildUseCase({
      detectedTools: ["claude"],
      deployedStateForScope: (tools) =>
        tools === undefined ? "diverged" : "clean",
    });

    await expect(useCase.preflight(removeTddGlobally)).resolves.toEqual({
      ok: true,
      warning: "local-edits-will-be-lost",
      reclaim: [],
    });
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
// only for the exact paths the confirmation named and the user agreed to
// (P0): a path preflight could not name, or one the request never echoed
// back, is never reclaimed inside a confirmed action.
describe("RemoveDeployedSkill cleaning up after a global remove", () => {
  const CLAUDE_TDD_PATH = "/home/.claude/skills/tdd";

  it("reclaims the leftover copy the user confirmed by path", async () => {
    const { useCase, calls } = buildUseCase({ detectedTools: ["codex"] });

    await expect(
      useCase.execute({
        ...removeTddGlobally,
        confirmedReclaimPaths: [CLAUDE_TDD_PATH],
      }),
    ).resolves.toEqual({
      ok: true,
      removed: { type: "skill", name: "tdd" },
    });
    expect(calls.cleanups).toEqual([
      { target: { kind: "global" }, name: "tdd", tools: ["claude"] },
    ]);
  });

  it("reclaims nothing when the confirmation never named the leftover path", async () => {
    // The P0 case: a leftover exists, but nothing confirmed it — so the
    // removal must not delete more than the user agreed to.
    const { useCase, calls } = buildUseCase({ detectedTools: ["codex"] });

    await expect(useCase.execute(removeTddGlobally)).resolves.toEqual({
      ok: true,
      removed: { type: "skill", name: "tdd" },
    });
    expect(calls.cleanups).toEqual([]);
  });

  it("reclaims nothing when the confirmed path no longer matches what would be reclaimed", async () => {
    // A stale or mismatched confirmation names a path that isn't the one
    // about to be deleted — treated the same as never having been confirmed.
    const { useCase, calls } = buildUseCase({ detectedTools: ["codex"] });

    await expect(
      useCase.execute({
        ...removeTddGlobally,
        confirmedReclaimPaths: ["/home/.agents/skills/tdd"],
      }),
    ).resolves.toEqual({
      ok: true,
      removed: { type: "skill", name: "tdd" },
    });
    expect(calls.cleanups).toEqual([]);
  });

  it("leaves a detected tool's tree to the removal itself", async () => {
    const { useCase, calls } = buildUseCase({
      detectedTools: ["claude", "codex"],
    });

    await useCase.execute({
      ...removeTddGlobally,
      confirmedReclaimPaths: [CLAUDE_TDD_PATH],
    });

    expect(calls.cleanups).toEqual([]);
  });

  it("keeps a skills directory several tools read, even when its tool is gone", async () => {
    // Codex is undetected, but nine other apm targets deploy under .agents. An
    // absent Codex proves nothing about them, so the copy stays (#202).
    const { useCase, calls } = buildUseCase({ detectedTools: ["claude"] });

    await useCase.execute(removeTddGlobally);

    expect(calls.cleanups).toEqual([]);
  });

  it("reclaims nothing when the removal itself failed", async () => {
    // apm never printed its uninstall marker, so the skill may still be there.
    // Deleting a subtree now would destroy a copy no removal replaced.
    const { useCase, calls } = buildUseCase({
      detectedTools: ["codex"],
      removed: false,
    });

    await expect(
      useCase.execute({
        ...removeTddGlobally,
        confirmedReclaimPaths: [CLAUDE_TDD_PATH],
      }),
    ).resolves.toEqual({
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

    await expect(
      useCase.execute({
        ...removeTddGlobally,
        confirmedReclaimPaths: [CLAUDE_TDD_PATH],
      }),
    ).resolves.toEqual({
      ok: true,
      removed: { type: "skill", name: "tdd" },
    });
    expect(calls.cleanups).toHaveLength(1);
  });

  it("reclaims nothing on the per-repo path", async () => {
    // A repo's targets are its own apm.yml, not this machine's tool detection.
    const { useCase, calls } = buildUseCase({ detectedTools: ["codex"] });

    await useCase.execute({
      ...removeTdd,
      confirmedReclaimPaths: [CLAUDE_TDD_PATH],
    });

    expect(calls.cleanups).toEqual([]);
  });
});

// What the preflight names before the user confirms — the P0 fix. A global
// removal may force-delete a leftover tool's whole copy; the confirmation
// must name that path by tool so the dialog can state it, and a path
// preflight could not build is dropped rather than guessed (#P0).
describe("RemoveDeployedSkill.preflight naming the reclaim", () => {
  it("names the leftover copy's tool and absolute path", async () => {
    const { useCase } = buildUseCase({ detectedTools: ["codex"] });

    await expect(useCase.preflight(removeTddGlobally)).resolves.toEqual({
      ok: true,
      warning: null,
      reclaim: [{ tool: "claude", path: "/home/.claude/skills/tdd" }],
    });
  });

  it("names nothing when every exclusive tool is still detected", async () => {
    const { useCase } = buildUseCase({
      detectedTools: ["claude", "codex"],
    });

    await expect(useCase.preflight(removeTddGlobally)).resolves.toEqual({
      ok: true,
      warning: null,
      reclaim: [],
    });
  });

  it("never previews a reclaim on the per-repo path", async () => {
    // A repo's targets are its own apm.yml, not this machine's detection —
    // there is nothing here for the machine's tool presence to reclaim.
    const { useCase } = buildUseCase({ detectedTools: ["codex"] });

    await expect(useCase.preflight(removeTdd)).resolves.toEqual({
      ok: true,
      warning: null,
      reclaim: [],
    });
  });

  it("drops a leftover it cannot build a path for, rather than guessing one", async () => {
    const { useCase } = buildUseCase({
      detectedTools: ["codex"],
      treeRoot: () => {
        throw new Error("HOME unreadable");
      },
    });

    await expect(useCase.preflight(removeTddGlobally)).resolves.toEqual({
      ok: true,
      warning: null,
      reclaim: [],
    });
  });
});

// What the confirmation must say before the user destroys a deployed copy. The
// two cases stay apart on purpose: an unverifiable copy is not a diverged one,
// and calling it "edited" would be a claim we cannot make (#337).
describe("RemoveDeployedSkill.preflight", () => {
  it("warns that local edits will be lost when the copy diverged", async () => {
    const { useCase, calls } = buildUseCase({ deployedState: "diverged" });

    await expect(useCase.preflight(removeTdd)).resolves.toEqual({
      ok: true,
      warning: "local-edits-will-be-lost",
      reclaim: [],
    });
    // A check, not the action: nothing is removed by asking.
    expect(calls.removes).toEqual([]);
  });

  it("warns separately when there is no baseline to verify against", async () => {
    const { useCase } = buildUseCase({ deployedState: "unverifiable" });

    await expect(useCase.preflight(removeTdd)).resolves.toEqual({
      ok: true,
      warning: "cannot-verify-local-edits",
      reclaim: [],
    });
  });

  it("says the copy could not be checked when it cannot be read", async () => {
    // Distinct from "no baseline recorded": there, the check ran and found
    // nothing to compare against. Here it never ran at all.
    const { useCase } = buildUseCase({ deployedState: "unreadable" });

    await expect(useCase.preflight(removeTdd)).resolves.toEqual({
      ok: true,
      warning: "check-did-not-run",
      reclaim: [],
    });
  });

  it("says the same when the lockfile the check reads does not parse", async () => {
    const { useCase } = buildUseCase({ deployedState: "lockfile-malformed" });

    await expect(useCase.preflight(removeTdd)).resolves.toEqual({
      ok: true,
      warning: "check-did-not-run",
      reclaim: [],
    });
  });

  it("warns about nothing when the copy still matches the lockfile", async () => {
    const { useCase } = buildUseCase({ deployedState: "clean" });

    await expect(useCase.preflight(removeTdd)).resolves.toEqual({
      ok: true,
      warning: null,
      reclaim: [],
    });
  });

  it("warns about nothing when there is no copy on disk to lose", async () => {
    const { useCase } = buildUseCase({ deployedState: "not-deployed" });

    await expect(useCase.preflight(removeTdd)).resolves.toEqual({
      ok: true,
      warning: null,
      reclaim: [],
    });
  });

  it("refuses an unregistered repo before reading anything", async () => {
    // A path-taking read is still a path-taking endpoint: an unregistered path
    // may not probe a lockfile through the back door (security.md).
    const classified: string[] = [];
    const useCase = new RemoveDeployedSkill({
      registry: { isRegistered: async () => false },
      deployedRef: { resolve: async () => ({ ok: true, ref: REF }) },
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
      deployedRef: { resolve: async () => ({ ok: true, ref: REF }) },
      deployedContent: {
        classify: async () => {
          throw new Error("disk exploded");
        },
      },
      apm: { removeSkill: async () => ({ ok: true }) },
      deployedCleanup: { removeSkillTargets: async () => undefined },
      toolPresence: { detectGlobalTools: async () => ["claude"] },
      canonicalPath: async (path) => path,
      location: { treeRoot: () => "/home" },
    });

    await expect(useCase.preflight(removeTdd)).resolves.toEqual({
      ok: false,
      error: "preflight-failed",
    });
  });
});
