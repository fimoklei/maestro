import { Navigate, Outlet, useLocation } from "react-router-dom";
import { ConfigUnreachableNotice } from "../inventory/config-unreachable-notice";
import { useInventoryConfig } from "../inventory/use-inventory";
import { useFirstRun, useIsConfigured } from "./use-first-run";

// First-run gate: when no inventory path is configured the cockpit would
// dead-end on a "not configured" panel. Instead we route to the first-run
// wizard — the guided welcome → connect flow (issue #96) — unless the user is
// already inside it, or on the Settings connect screen reached directly (so
// either form can do its job). The signal is useFirstRun, backed by the config
// endpoint's 200-with-inventoryPath-null answer: a success response, so there
// is no retry delay before the redirect (unlike keying off an error). While the
// config is still loading, every route *other than the welcome root* renders
// unchanged — but /welcome itself is held on a neutral loading state until the
// answer is known (see below), so it never flashes for a configured user.
//
// The reverse also has to hold ("configured -> the wizard never shows",
// issue #96): a configured user who deep-links or navigates straight to
// /welcome (a stale bookmark, browser back/forward) is bounced to the landing
// route too, not just an unconfigured one bounced in — and this has to hold
// even during the pending window before the config query resolves, not only
// once it does (Codex review finding), otherwise WelcomeView renders for one
// tick before the effect-free redirect below ever runs. This only guards the
// welcome root, not /welcome/connect: the connect step is where "unconfigured"
// flips to "configured" mid-flow (the moment the connect mutation succeeds),
// and it deliberately keeps showing its confirmation + "Continue" until the
// user acts — bouncing on that same state change would yank the confirmation
// away before it can be read. It manages its own pending/redirect guard
// locally instead (see wizard-connect-view.tsx), because only it can tell
// "already configured on arrival" apart from "just connected here".
const WIZARD_PATH = "/welcome";
const CONNECT_PATH = "/connect";

function isWizardRoute(pathname: string): boolean {
  return pathname === WIZARD_PATH || pathname.startsWith(`${WIZARD_PATH}/`);
}

export function FirstRunGate() {
  const { pathname } = useLocation();
  const config = useInventoryConfig();
  const firstRun = useFirstRun();
  const configured = useIsConfigured();

  const alreadyOnAFirstRunRoute =
    pathname === CONNECT_PATH || isWizardRoute(pathname);

  if (firstRun && !alreadyOnAFirstRunRoute) {
    return <Navigate to={WIZARD_PATH} replace />;
  }

  if (pathname === WIZARD_PATH) {
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
