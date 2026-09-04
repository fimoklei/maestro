// Shared test helper: the drift dependency createApp asks for, with the
// content check answered by nothing — every behind row falls back to Behind
// (ADR-0027 §4). For tests that exercise other routes, and for drift tests that
// only assert what `apm outdated` reported.
import {
  CheckVersionDrift,
  DeployedLocation,
  ReadDrift,
  type Registry,
} from "@maestro/core";

export const withoutContentCheck = (drift: CheckVersionDrift) =>
  new ReadDrift({
    drift,
    fs: { readFile: async () => null },
    location: new DeployedLocation({}),
    resolveRoot: async () => undefined,
    git: {
      fetch: async () => undefined,
      readOrigin: async () => null,
      readSkillTreesAtTag: async () => null,
    },
  });

export const stubDrift = (deps: { registry: Registry }) =>
  withoutContentCheck(
    new CheckVersionDrift({
      registry: deps.registry,
      apm: { checkOutdated: async () => ({ ok: true, behind: [] }) },
      canonicalPath: async (path) => path,
    }),
  );
