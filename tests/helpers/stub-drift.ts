// Shared test helper: a CheckVersionDrift whose apm port reports nothing
// behind, for tests that exercise other routes but must satisfy createApp's
// drift dependency.
import { CheckVersionDrift, type Registry } from "@maestro/core";

export const stubDrift = (deps: { registry: Registry }) =>
  new CheckVersionDrift({
    registry: deps.registry,
    apm: { checkOutdated: async () => ({ ok: true, behind: [] }) },
    canonicalPath: async (path) => path,
  });
