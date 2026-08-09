// Shared test helper: a ConnectInventory wired to a throwaway config path, for
// tests that exercise other routes but must satisfy createApp's connect
// dependency. The connect route is never hit in those scenarios, so the path is
// inert; the connect endpoint itself is covered in
// server-inventory-connect.test.ts.
import {
  ConfigStore,
  ConnectInventory,
  NodeFileSystem,
  ScaffoldOffers,
} from "@maestro/core";

export function stubConnect(): ConnectInventory {
  const fs = new NodeFileSystem();
  return new ConnectInventory({
    fs,
    store: new ConfigStore({
      fs,
      configPath: () => "/nonexistent-maestro/config.json",
    }),
    originUrl: async () => null,
    defaultBranch: async () => null,
    isRepositoryRoot: async () => false,
    probeHead: async () => "unknown" as const,
    homeRoot: () => "/nonexistent-maestro",
    clone: { clone: async () => "clone-unavailable" },
    offers: new ScaffoldOffers(),
  });
}
