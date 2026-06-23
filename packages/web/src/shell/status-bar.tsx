import { Logo } from "../ui/logo";
import { StatusDot } from "../ui/status-dot";
import { useHealth } from "../use-health";

// Top status bar: the wordmark plus the live server connection. Health is
// server-state (TanStack Query via useHealth); the bar only reflects it. The
// container computes the connection and hands it to the presentational view, so
// the view stays storyable without a live hook (frontend.md).
export type Connection = "checking" | "connected" | "disconnected";

const CONNECTION_TEXT: Record<Connection, string> = {
  checking: "Connecting…",
  connected: "Connected",
  disconnected: "Disconnected",
};

export function StatusBar() {
  const health = useHealth();
  const connection: Connection = health.isPending
    ? "checking"
    : health.isError || !health.data?.ok
      ? "disconnected"
      : "connected";

  return <StatusBarView connection={connection} />;
}

// Presentational: the dot is decorative, so the connection state is also carried
// in text.
export function StatusBarView({ connection }: { connection: Connection }) {
  return (
    <header className="flex items-center justify-between gap-3 border-line-chip border-b px-4 py-2.5">
      <Logo wordmark />
      <span className="flex items-center gap-2 font-ui text-tag text-muted">
        <StatusDot status={connection === "connected" ? "ok" : "drift"} />
        {CONNECTION_TEXT[connection]}
      </span>
    </header>
  );
}
