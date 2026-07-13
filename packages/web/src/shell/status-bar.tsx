import type { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useInventory, useInventoryConfig } from "../inventory/use-inventory";
import { Chip, type ChipProps } from "../ui/chip";
import { cn } from "../ui/cn";
import { Logo } from "../ui/logo";
import { StatusDot, type StatusDotProps } from "../ui/status-dot";
import { useHealth } from "../use-health";
import { primitiveCountLabel } from "./primitive-count-label";

// Top status bar: the wordmark plus the header's setup/connection state, laid
// out to the Control Room design (docs/design/first-run) — a context line beside
// the wordmark, a status Chip on the right, and, once connected, a ⚙ gear that
// opens the Inventory source view. It reads two server-state signals (TanStack
// Query) and never conflates them: /api/health says "the app reached its own
// local server", /api/inventory/config says "an inventory is connected". A
// healthy server with no inventory is first-run, not "connected" (issue #110).
// The container derives one view descriptor and hands it to the presentational
// view, so the header stays storyable without a live hook.
export type Connection =
  | "checking"
  | "setup-required"
  | "connected"
  | "disconnected";

// One entry per state keeps its chip tone, dot tone, label, and the design's
// wordmark context note together. Dot + chip semantics: green = go, grey =
// neutral/waiting, amber = problem. "connecting…" and "setup required" are both
// neutral (nothing is wrong); only a real reachability failure is amber. Loading
// is not drift. `context` is the design's wordmark note. Connected's context is
// dynamic (the source name + count), so it carries no static context here.
interface ConnectionView {
  label: string;
  tone: ChipProps["tone"];
  dot: StatusDotProps["status"];
  context?: string;
}

// One label for the source gear, reused as its accessible name and hover title.
const SOURCE_ENTRY_LABEL = "Inventory source";

const CONNECTION_VIEW: Record<Connection, ConnectionView> = {
  checking: { label: "connecting…", tone: "dim", dot: "muted" },
  "setup-required": {
    label: "setup required",
    tone: "dim",
    dot: "muted",
    context: "no inventory connected",
  },
  connected: { label: "connected", tone: "ok", dot: "ok" },
  disconnected: { label: "disconnected", tone: "drift", dot: "drift" },
};

// Fixed precedence ladder (issue #110): error before waiting, waiting before
// content, so no unknown state can ever read as "connected".
//
//  1. health error / ok === false      → disconnected  (server truly down)
//  2. health OR config still pending    → checking      (don't guess)
//  3. config query errored              → disconnected  (can't confirm setup)
//  4. inventoryPath === null            → setup-required
//  5. inventoryPath !== null            → connected
//
// Config is read directly (not via useFirstRun/useIsConfigured, which flatten
// "pending" to false and would flash "setup required" for a configured user).
function deriveConnection(
  health: ReturnType<typeof useHealth>,
  config: ReturnType<typeof useInventoryConfig>,
): Connection {
  if (health.isError || health.data?.ok === false) return "disconnected";
  if (health.isPending || config.isPending) return "checking";
  if (config.isError) return "disconnected";
  return config.data.inventoryPath === null ? "setup-required" : "connected";
}

// The header's inventory-source entry: the connected source's name + live
// primitive count (shown as context text), plus the ⚙ gear that opens the source
// view. Null unless connected — there is no source to point at during
// setup/first-run. `active` marks the gear as the current view while on /source.
export interface SourceEntry {
  name: string;
  countLabel: string;
  active: boolean;
  onOpen: () => void;
}

export function StatusBar() {
  const health = useHealth();
  const config = useInventoryConfig();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const connection = deriveConnection(health, config);

  // The source moved from the sidebar into the header (issue #109). Only a
  // connected inventory has a source; the ⚙ gear is the entry point to the whole
  // source view (status · re-read · change source), reached at /source. Gate the
  // primitive read on being connected: during first-run
  // /api/inventory/primitives 409s, and an ungated query would retry that
  // failure behind the wizard.
  const connected = connection === "connected";
  const inventory = useInventory({ enabled: connected });
  const path = config.data?.inventoryPath ?? null;
  const source: SourceEntry | null =
    connected && path !== null
      ? {
          name: basename(path),
          countLabel: primitiveCountLabel(inventory.data?.primitives.length),
          active: pathname === "/source",
          onOpen: () => navigate("/source"),
        }
      : null;

  return <StatusBarView connection={connection} source={source} />;
}

// The trailing path segment stands in for the source name in the header, so the
// long absolute path doesn't crowd the bar; the full path still shows in the
// source view.
function basename(path: string): string {
  const segments = path.split("/").filter(Boolean);
  return segments.at(-1) ?? path;
}

// Presentational: the status is carried both by the chip's dot (decorative) and
// its text, so colour is never the only signal. The source entry is optional and
// driven by a callback, so the header stays storyable without a live hook or
// router.
export function StatusBarView({
  connection,
  source = null,
}: {
  connection: Connection;
  source?: SourceEntry | null;
}) {
  const view = CONNECTION_VIEW[connection];
  const context: ReactNode = source ? (
    <SourceContext name={source.name} countLabel={source.countLabel} />
  ) : (
    view.context
  );

  return (
    <header className="flex items-center gap-3 border-line-chip border-b px-4 py-2.5">
      <Logo wordmark context={context} />
      <Chip tone={view.tone} className="ml-auto">
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
            "grid size-6 shrink-0 place-items-center rounded-control border font-mono text-tag transition-colors",
            source.active
              ? "border-amber-border bg-amber-bg text-amber-ink"
              : "border-line-chip text-dim hover:bg-active hover:text-fg",
          )}
        >
          {/* Decorative — the accessible name comes from aria-label. */}
          <span aria-hidden="true">⚙</span>
        </button>
      ) : null}
    </header>
  );
}

// The connected source name + live primitive count, shown as dim mono context
// beside the wordmark. The name is user-controlled and can be long, so it
// truncates visually (keeping the connection state on-screen) while the full
// name stays available on hover via title; the count never wraps off.
function SourceContext({
  name,
  countLabel,
}: {
  name: string;
  countLabel: string;
}) {
  return (
    <span className="inline-flex min-w-0 max-w-xs items-center">
      <span className="truncate" title={name}>
        {name}
      </span>
      {/* whitespace-pre keeps the " · " separator's leading space, which the
          adjacent truncated (overflow-hidden) name span would otherwise collapse. */}
      <span className="shrink-0 whitespace-pre"> · {countLabel}</span>
    </span>
  );
}
