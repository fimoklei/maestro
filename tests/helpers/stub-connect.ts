// A ConnectInventory on an inert config path, for tests that must satisfy
// createApp's connect dependency without calling the connect route.
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
