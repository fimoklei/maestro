import { describe, expect, it } from "vitest";
import type { DeployTarget } from "../deploy/deploy-skill";
import { CheckVersionDrift } from "./check-version-drift";

const registeredRepo = "/repos/app";

type VersionDrift = { name: string; current: string; latest: string };
type OutdatedResult =
  | { ok: true; behind: VersionDrift[] }
  | { ok: false; reason?: "unverified" };

const tddBehind: VersionDrift = {
  name: "tdd",
  current: "v0.5.0",
  latest: "v0.5.1",
};

// `calls` records the targets apm was asked about.
const makeDeps = (overrides?: {
  isRegistered?: (path: string) => Promise<boolean>;
  outcome?: OutdatedResult;
}) => {
  const calls: DeployTarget[] = [];
  const outcome: OutdatedResult = overrides?.outcome ?? {
    ok: true,
    behind: [],
  };
  return {
    deps: {
      registry: {
        isRegistered:
          overrides?.isRegistered ??
          (async (path: string) => path === registeredRepo),
      },
      apm: {
        checkOutdated: async (
          target: DeployTarget,
        ): Promise<OutdatedResult> => {
          calls.push(target);
          return outcome;
        },
      },
      canonicalPath: async (path: string) => path,
    },
    calls,
  };
};

describe("CheckVersionDrift", () => {
  it("refuses an unregistered repo before any apm access", async () => {
    const { deps, calls } = makeDeps();
    const useCase = new CheckVersionDrift(deps);

    const result = await useCase.execute({
      target: { kind: "repo", repoPath: "/repos/not-registered" },
    });

    expect(result).toEqual({ ok: false });
    expect(calls).toEqual([]);
  });

  it("propagates a driver failure as a check-failed result", async () => {
    const { deps } = makeDeps({ outcome: { ok: false } });
    const useCase = new CheckVersionDrift(deps);

    const result = await useCase.execute({
      target: { kind: "repo", repoPath: registeredRepo },
    });

    expect(result).toEqual({ ok: false });
  });

  it("propagates the driver's unverified reason unchanged", async () => {
    const { deps } = makeDeps({ outcome: { ok: false, reason: "unverified" } });
    const useCase = new CheckVersionDrift(deps);

    const result = await useCase.execute({
      target: { kind: "repo", repoPath: registeredRepo },
    });

    expect(result).toEqual({ ok: false, reason: "unverified" });
  });

  it("returns the behind pair for a registered repo", async () => {
    const { deps } = makeDeps({ outcome: { ok: true, behind: [tddBehind] } });
    const useCase = new CheckVersionDrift(deps);

    const result = await useCase.execute({
      target: { kind: "repo", repoPath: registeredRepo },
    });

    expect(result).toEqual({ ok: true, behind: [tddBehind] });
  });

  it("checks global drift without consulting the registry", async () => {
    const { deps, calls } = makeDeps({
      isRegistered: async () => {
        throw new Error("registry must not be consulted for global drift");
      },
      outcome: { ok: true, behind: [tddBehind] },
    });
    const useCase = new CheckVersionDrift(deps);

    const result = await useCase.execute({ target: { kind: "global" } });

    expect(result).toEqual({ ok: true, behind: [tddBehind] });
    expect(calls).toEqual([{ kind: "global" }]);
  });
});
