// The production composition over the real disk and git. apm, tool detection,
// gh and the folder chooser are faked: a test passes the ones its route reaches.
import { composeUseCases, nodeUseCasePorts } from "@maestro/core";
import { createApp } from "@maestro/server";
import { type Overrides, unreachable } from "./in-memory-app";
import { unavailableHarnessReview } from "./stub-review";

export const nodeApp = (
  env: { HOME: string; MAESTRO_HOME: string } & NodeJS.ProcessEnv,
  { git, ...overrides }: Overrides = {},
) => {
  const ports = nodeUseCasePorts(env);
  return createApp({
    ...composeUseCases({
      ...ports,
      home: () => env.HOME,
      apm: unreachable("apm"),
      toolPresence: unreachable("toolPresence"),
      gh: unavailableHarnessReview(),
      folderChooser: null,
      ...overrides,
      git: { ...ports.git, ...git },
    }),
    enforceOriginHost: false,
  });
};
