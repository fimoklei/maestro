// Shared test helper: a ScaffoldHarness wired to nothing reachable, for tests
// that exercise other routes but must satisfy createApp's scaffold dependency.
// The scaffold route itself is covered in scaffold-harness-journey.test.ts.
import {
  InFlightLocks,
  NodeFileSystem,
  ScaffoldHarness,
  ScaffoldOffers,
} from "@maestro/core";

export function stubScaffold(): ScaffoldHarness {
  return new ScaffoldHarness({
    fs: new NodeFileSystem(),
    locks: new InFlightLocks(),
    offers: new ScaffoldOffers(),
    git: {
      isRepositoryRoot: async () => false,
      defaultBranch: async () => null,
      currentBranch: async () => null,
      hasCommits: async () => false,
      commit: async () => "commit-failed",
      push: async () => "rejected",
      setOriginHead: async () => {},
      unstage: async () => {},
    },
    originUrl: async () => null,
    connect: async () => ({ ok: false, error: "not-an-inventory" }),
  });
}
