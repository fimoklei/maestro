import type { UseCases } from "@maestro/core";

export type AppDeps = UseCases & {
  // Production always enables the guard; tests construct it disabled.
  enforceOriginHost: boolean;
};
