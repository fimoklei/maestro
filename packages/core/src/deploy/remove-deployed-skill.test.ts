import { describe, expect, it } from "vitest";
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
