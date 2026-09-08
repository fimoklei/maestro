import type { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router";
import { useInventory, useInventoryConfig } from "../inventory/use-inventory";
import { Chip, type ChipProps } from "../ui/chip";
import { cn } from "../ui/cn";
import { HOVER_TRANSITION } from "../ui/hover-transition";
import { Logo } from "../ui/logo";
import { StatusDot, type StatusDotProps } from "../ui/status-dot";
import { useHealth } from "../use-health";
import { primitiveCountLabel } from "./primitive-count-label";
import { targetLabel } from "./target-label";

// Reads two signals, never conflated: /api/health = server reachable,
// /api/inventory/config = inventory connected (#110).
export type Connection =
  | "checking"
  | "setup-required"
  | "connected"
  | "disconnected";

// Dot + chip: green = go, grey = neutral/waiting, amber = problem. "connecting…"
// and "setup required" are neutral — only a real reachability failure is amber.
interface ConnectionView {
  label: string;
  tone: ChipProps["tone"];
  dot: StatusDotProps["status"];
  context?: string;
}

// One label for the source gear, reused as its accessible name and hover title.
const SOURCE_ENTRY_LABEL = "Harness location";

const CONNECTION_VIEW: Record<Connection, ConnectionView> = {
  checking: { label: "Connecting…", tone: "dim", dot: "muted" },
  "setup-required": {
    label: "Setup required",
    tone: "dim",
    dot: "muted",
    context: "No inventory connected",
  },
  connected: { label: "Connected", tone: "ok", dot: "ok" },
  disconnected: { label: "Disconnected", tone: "drift", dot: "drift" },
};

// Fixed precedence (#110): error before waiting, waiting before content, so
// no unknown state reads as "connected". Config read directly, not via
// useFirstRun/useIsConfigured — those flatten "pending" to false.
function deriveConnection(
  health: ReturnType<typeof useHealth>,
  config: ReturnType<typeof useInventoryConfig>,
): Connection {
  if (health.isError || health.data?.ok === false) return "disconnected";
  if (health.isPending || config.isPending) return "checking";
  if (config.isError) return "disconnected";
  return config.data.inventoryPath === null ? "setup-required" : "connected";
}

// Null unless connected — nothing to point at during setup/first-run.
export interface SourceEntry {
  name: string;
  // Full path shown on hover, beyond the shortened label (#211).
  title: string;
  // Null where the read failed: an unread Inventory has no count, and the last
  // one would state a number nothing confirmed (#841).
  countLabel: string | null;
  active: boolean;
  onOpen: () => void;
}

export function StatusBar() {
  const health = useHealth();
  const config = useInventoryConfig();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const connection = deriveConnection(health, config);

  // Gated on connected: during first-run /api/inventory/primitives 409s, and
  // an ungated query would retry that failure behind the connect gate.
  const connected = connection === "connected";
  const inventory = useInventory({ enabled: connected });
  const path = config.data?.inventoryPath ?? null;
  const source: SourceEntry | null =
    connected && path !== null
      ? {
          name: targetLabel(path),
          title: path,
          countLabel: inventory.isError
            ? null
            : primitiveCountLabel(inventory.data?.primitives.length),
          active: pathname === "/source",
          onOpen: () => navigate("/source"),
        }
      : null;

  return <StatusBarView connection={connection} source={source} />;
}

// Presentational: status carried by both the chip's dot and its text, colour
// never the only signal. Source entry optional, driven by a callback, so this
// stays storyable without a live hook.
export function StatusBarView({
  connection,
  source = null,
}: {
  connection: Connection;
  source?: SourceEntry | null;
}) {
  const view = CONNECTION_VIEW[connection];
  const context: ReactNode = source ? (
    <SourceContext
      name={source.name}
      title={source.title}
      countLabel={source.countLabel}
    />
  ) : (
    view.context
  );

  return (
    <header className="flex items-center gap-3 border-line-chip border-b px-4 py-2.5">
      <Logo wordmark context={context} className="min-w-0" />
      <Chip tone={view.tone} className="ml-auto shrink-0">
        <span className="inline-flex items-center gap-1.5">
          <StatusDot status={view.dot} />
          {view.label}
        </span>
      </Chip>
      {source ? (
        <button
          type="button"
          aria-label={SOURCE_ENTRY_LABEL}
          aria-current={source.active ? "page" : undefined}
          title={SOURCE_ENTRY_LABEL}
          onClick={source.onOpen}
          className={cn(
            "grid size-6 shrink-0 place-items-center rounded-control border font-mono text-tag",
            HOVER_TRANSITION,
            source.active
              ? "border-amber-border bg-amber-bg text-amber-ink"
              : "border-line-chip text-dim hover:bg-inset hover:text-fg-2",
          )}
        >
          {/* Decorative — the accessible name comes from aria-label. */}
          <span aria-hidden="true">⚙</span>
        </button>
      ) : null}
    </header>
  );
}

// Name truncates visually (#211); count never wraps off.
function SourceContext({
  name,
  title,
  countLabel,
}: {
  name: string;
  title: string;
  countLabel: string | null;
}) {
  return (
    <span className="inline-flex min-w-0 max-w-xs items-center">
      <span className="truncate" title={title}>
        {name}
      </span>
      {/* whitespace-pre: the adjacent truncated span would collapse the leading space. */}
      {countLabel === null ? null : (
        <span className="shrink-0 whitespace-pre"> · {countLabel}</span>
      )}
    </span>
  );
}
