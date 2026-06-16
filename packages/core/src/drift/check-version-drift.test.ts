import { describe, expect, it } from "vitest";
import type { DeployTarget } from "../deploy/deploy-skill";
import { CheckVersionDrift } from "./check-version-drift";

const registeredRepo = "/repos/app";

type OutdatedResult = { ok: true; behind: string[] } | { ok: false };

// Plain-object fakes (the house style — no mocking framework). `calls` records
// the targets apm was asked about, so a test can assert apm was never reached.
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

  it("returns the behind set for a registered repo", async () => {
    const { deps } = makeDeps({ outcome: { ok: true, behind: ["tdd"] } });
    const useCase = new CheckVersionDrift(deps);

    const result = await useCase.execute({
      target: { kind: "repo", repoPath: registeredRepo },
    });

    expect(result).toEqual({ ok: true, behind: ["tdd"] });
  });

  it("checks global drift without consulting the registry", async () => {
    const { deps, calls } = makeDeps({
      isRegistered: async () => {
        throw new Error("registry must not be consulted for global drift");
      },
      outcome: { ok: true, behind: ["tdd"] },
    });
    const useCase = new CheckVersionDrift(deps);

    const result = await useCase.execute({ target: { kind: "global" } });

    expect(result).toEqual({ ok: true, behind: ["tdd"] });
    expect(calls).toEqual([{ kind: "global" }]);
  });
});
