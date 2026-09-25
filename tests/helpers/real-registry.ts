// The env is empty, so an ambient MAESTRO_INVENTORY_PATH cannot reach a test.
import {
  ConfigStore,
  type FileSystemPort,
  Registry,
  resolveInventoryPath,
} from "@maestro/core";

type ResolveCentralInventoryPath = ConstructorParameters<
  typeof Registry
>[0]["resolveCentralInventoryPath"];

export const centralInventoryPath: ResolveCentralInventoryPath = (config) =>
  resolveInventoryPath(config, {});

export const realRegistry = (fs: FileSystemPort, configPath: string) =>
  new Registry({
    fs,
    store: new ConfigStore({ fs, configPath: () => configPath }),
    resolveCentralInventoryPath: centralInventoryPath,
  });
