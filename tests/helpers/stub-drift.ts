// The content check is answered by nothing, so every behind row falls back to Behind.
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
