// Global's layout with CLAUDE_CONFIG_DIR unset, for tests that do not move it.
import { type GlobalLayout, resolveGlobalLayout } from "./deploy-tools";

export const DEFAULT_GLOBAL_LAYOUT: GlobalLayout = resolveGlobalLayout({
  env: {},
  home: "/home",
  apmCwd: "/home/.maestro/.apm-scratch",
  realpath: (path) => path,
});
