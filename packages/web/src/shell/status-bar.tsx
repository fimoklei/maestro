import { useInventoryConfig } from "../inventory/use-inventory";
import { Logo } from "../ui/logo";
import { StatusDot, type StatusDotProps } from "../ui/status-dot";
import { useHealth } from "../use-health";

// Top status bar: the wordmark plus the header's setup/connection state. It reads
// two server-state signals (TanStack Query) and never conflates them: /api/health
// says "the app reached its own local server", /api/inventory/config says "an
// inventory is connected". A healthy server with no inventory is first-run, not
// "Connected" (issue #110). The container derives one label and hands it to the
// presentational view, so the view stays storyable without a live hook.
export type Connection =
  | "checking"
  | "setup-required"
  | "connected"
  | "disconnected";

// One entry per state keeps its label and dot tone together. Dot semantics:
// green = go, grey = neutral/waiting, amber = problem. "Connecting…" and "Setup
// required" are both neutral (nothing is wrong); only a real reachability failure
// is amber. Loading is not drift.
const CONNECTION_VIEW: Record<
  Connection,
  { text: string; dot: StatusDotProps["status"] }
> = {
  checking: { text: "Connecting…", dot: "muted" },
  "setup-required": { text: "Setup required", dot: "muted" },
  connected: { text: "Connected", dot: "ok" },
  disconnected: { text: "Disconnected", dot: "drift" },
};

// Fixed precedence ladder (issue #110): error before waiting, waiting before
// content, so no unknown state can ever read as "Connected".
//
//  1. health error / ok === false      → disconnected  (server truly down)
//  2. health OR config still pending    → checking      (don't guess)
//  3. config query errored              → disconnected  (can't confirm setup)
//  4. inventoryPath === null            → setup-required
//  5. inventoryPath !== null            → connected
//
// Config is read directly (not via useFirstRun/useIsConfigured, which flatten
// "pending" to false and would flash "Setup required" for a configured user).
function deriveConnection(
  health: ReturnType<typeof useHealth>,
  config: ReturnType<typeof useInventoryConfig>,
): Connection {
  if (health.isError || health.data?.ok === false) return "disconnected";
  if (health.isPending || config.isPending) return "checking";
  if (config.isError) return "disconnected";
  return config.data.inventoryPath === null ? "setup-required" : "connected";
}

export function StatusBar() {
  const health = useHealth();
  const config = useInventoryConfig();

  return <StatusBarView connection={deriveConnection(health, config)} />;
}

// Presentational: the dot is decorative, so the connection state is also carried
// in text.
export function StatusBarView({ connection }: { connection: Connection }) {
  const view = CONNECTION_VIEW[connection];
  return (
    <header className="flex items-center justify-between gap-3 border-line-chip border-b px-4 py-2.5">
      <Logo wordmark />
      <span className="flex items-center gap-2 font-ui text-tag text-muted">
        <StatusDot status={view.dot} />
        {view.text}
      </span>
    </header>
  );
}
