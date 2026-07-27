import { describe, expect, it } from "vitest";
import type { DeployedContentState } from "./deploy-skill";
import type { DeployedRefLookup } from "./deployed-ref";
import { InFlightLocks } from "./in-flight-locks";
import { RemoveDeployedSkill } from "./remove-deployed-skill";

const REF = "github.com/fimoklei/agent-harness/skills/tdd#v0.5.1";

// The removal request the cockpit sends for the row's own skill and repo.
const removeTdd = { type: "skill", name: "tdd", repoPath: "/repo" };

type Overrides = {
  registered?: boolean;
  lookup?: DeployedRefLookup;
  removed?: boolean;
  locks?: InFlightLocks;
  canonicalPath?: (path: string) => Promise<string>;
  deployedState?: DeployedContentState;
};

// The calls that reached the outside world, so a test can prove a refusal
// happened before apm — and before the lockfile — was ever touched.
function buildUseCase(overrides: Overrides = {}) {
  const calls: { lookups: string[]; removes: { ref: string }[] } = {
    lookups: [],
    removes: [],
  };
  const useCase = new RemoveDeployedSkill({
    registry: { isRegistered: async () => overrides.registered ?? true },
    deployedRef: {
      resolve: async ({ name }) => {
        calls.lookups.push(name);
        return overrides.lookup ?? { ok: true, ref: REF };
      },
    },
    deployedContent: {
      classify: async () => overrides.deployedState ?? "clean",
    },
    apm: {
      removeSkill: async ({ ref }) => {
        calls.removes.push({ ref });
        return (overrides.removed ?? true) ? { ok: true } : { ok: false };
      },
    },
    canonicalPath: overrides.canonicalPath ?? (async (path) => path),
    locks: overrides.locks,
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
    expect(calls.removes).toEqual([{ ref: REF }]);
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
    expect(calls.removes).toEqual([{ ref: REF }]);
  });

  it("removes a copy whose edits cannot be checked once the user has confirmed", async () => {
    const { useCase, calls } = buildUseCase({ deployedState: "unverifiable" });

    await expect(useCase.execute(removeTdd)).resolves.toEqual({
      ok: true,
      removed: { type: "skill", name: "tdd" },
    });
    expect(calls.removes).toEqual([{ ref: REF }]);
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
    expect(calls.removes).toEqual([{ ref: REF }]);
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
      canonicalPath: async (path) => path,
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
      useCase.execute({ ...removeTdd, repoPath: "/link/to/repo" }),
    ).resolves.toEqual({ ok: false, error: "remove-in-progress" });
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
    });
    // A check, not the action: nothing is removed by asking.
    expect(calls.removes).toEqual([]);
  });

  it("warns separately when there is no baseline to verify against", async () => {
    const { useCase } = buildUseCase({ deployedState: "unverifiable" });

    await expect(useCase.preflight(removeTdd)).resolves.toEqual({
      ok: true,
      warning: "cannot-verify-local-edits",
    });
  });

  it("says the copy could not be checked when it cannot be read", async () => {
    // Distinct from "no baseline recorded": there, the check ran and found
    // nothing to compare against. Here it never ran at all.
    const { useCase } = buildUseCase({ deployedState: "unreadable" });

    await expect(useCase.preflight(removeTdd)).resolves.toEqual({
      ok: true,
      warning: "check-did-not-run",
    });
  });

  it("says the same when the lockfile the check reads does not parse", async () => {
    const { useCase } = buildUseCase({ deployedState: "lockfile-malformed" });

    await expect(useCase.preflight(removeTdd)).resolves.toEqual({
      ok: true,
      warning: "check-did-not-run",
    });
  });

  it("warns about nothing when the copy still matches the lockfile", async () => {
    const { useCase } = buildUseCase({ deployedState: "clean" });

    await expect(useCase.preflight(removeTdd)).resolves.toEqual({
      ok: true,
      warning: null,
    });
  });

  it("warns about nothing when there is no copy on disk to lose", async () => {
    const { useCase } = buildUseCase({ deployedState: "not-deployed" });

    await expect(useCase.preflight(removeTdd)).resolves.toEqual({
      ok: true,
      warning: null,
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
      canonicalPath: async (path) => path,
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
      canonicalPath: async (path) => path,
    });

    await expect(useCase.preflight(removeTdd)).resolves.toEqual({
      ok: false,
      error: "preflight-failed",
    });
  });
});
