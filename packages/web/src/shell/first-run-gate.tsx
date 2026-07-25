import { Navigate, Outlet, useLocation } from "react-router";
import { ConfigUnreachableNotice } from "../inventory/config-unreachable-notice";
import { useInventoryConfig } from "../inventory/use-inventory";
import { useFirstRun, useIsConfigured } from "./use-first-run";

// First-run gate: when no inventory path is configured the cockpit would
// dead-end on a "not configured" panel. Instead we route to the connect gate —
// welcome, then the connect screen (ADR-0015) — unless the user is already
// inside it. The ⚙ Inventory source view (/source) is deliberately not
// exempt: it is connected-only (it shows "connected · N primitives"), so an
// unconfigured visitor belongs in the connect gate, not on a source view with
// nothing to show. The signal is useFirstRun, backed by the config
// endpoint's 200-with-inventoryPath-null answer: a success response, so there
// is no retry delay before the redirect (unlike keying off an error). While the
// config is still loading, every route *other than the welcome root* renders
// unchanged — but /welcome itself is held on a neutral loading state until the
// answer is known (see below), so it never flashes for a configured user.
//
// The reverse also has to hold ("configured -> the connect gate never shows",
// issue #96): a configured user who deep-links or navigates straight to
// /welcome (a stale bookmark, browser back/forward) is bounced to the landing
// route too, not just an unconfigured one bounced in — and this has to hold
// even during the pending window before the config query resolves, not only
// once it does (Codex review finding), otherwise WelcomeView renders for one
// tick before the effect-free redirect below ever runs. This only guards the
// welcome root, not /welcome/connect: the connect screen is where "unconfigured"
// flips to "configured" mid-flow (the moment the connect mutation succeeds),
// and it deliberately keeps showing its confirmation + "Continue" until the
// user acts — bouncing on that same state change would yank the confirmation
// away before it can be read. It manages its own pending/redirect guard
// locally instead (see connect-view.tsx), because only it can tell
// "already configured on arrival" apart from "just connected here".
const GATE_PATH = "/welcome";

function isGateRoute(pathname: string): boolean {
  return pathname === GATE_PATH || pathname.startsWith(`${GATE_PATH}/`);
}

export function FirstRunGate() {
  const { pathname } = useLocation();
  const config = useInventoryConfig();
  const firstRun = useFirstRun();
  const configured = useIsConfigured();

  if (firstRun && !isGateRoute(pathname)) {
    return <Navigate to={GATE_PATH} replace />;
  }

  if (pathname === GATE_PATH) {
    if (configured) {
      return <Navigate to="/" replace />;
    }
    if (config.isError) {
      // The gate's neutral hold waits for a *successful* config answer to
      // decide welcome vs redirect; a failed query would otherwise sit on
      // "Loading…" forever. Offer a readable error + retry instead (#103).
      return <ConfigUnreachableNotice onRetry={() => config.refetch()} />;
    }
    if (!firstRun) {
      // Config hasn't resolved yet, so it's not yet known whether this
      // visitor is a genuine first run (render Welcome) or a configured user
      // who should never see it (redirect) — show neither until it is.
      return <p className="text-dim text-tag">Loading…</p>;
    }
  }

  return <Outlet />;
}
