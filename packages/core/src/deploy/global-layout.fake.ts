import { type GlobalLayout, resolveGlobalLayout } from "./deploy-tools";

export const DEFAULT_GLOBAL_LAYOUT: GlobalLayout = resolveGlobalLayout({
  env: {},
  home: "/home",
  apmCwd: "/home/.maestro/.apm-scratch",
  realpath: (path) => path,
});
