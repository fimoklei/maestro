import type { UseCases } from "@maestro/core";

export type AppDeps = UseCases & {
  enforceOriginHost: boolean;
};
