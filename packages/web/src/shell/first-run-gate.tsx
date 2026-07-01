import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useFirstRun, useIsConfigured } from "./use-first-run";

// First-run gate: when no inventory path is configured the cockpit would
// dead-end on a "not configured" panel. Instead we route to the first-run
// wizard — the guided welcome → connect flow (issue #96) — unless the user is
// already inside it, or on the Settings connect screen reached directly (so
// either form can do its job). The signal is useFirstRun, backed by the config
// endpoint's 200-with-inventoryPath-null answer: a success response, so there
// is no retry delay before the redirect (unlike keying off an error). While the
// config is still loading, the requested view renders unchanged.
//
// The reverse also has to hold ("configured -> the wizard never shows",
// issue #96): a configured user who deep-links or navigates straight to
// /welcome (a stale bookmark, browser back/forward) is bounced to the landing
// route too, not just an unconfigured one bounced in. This only guards the
// welcome root, not /welcome/connect: the connect step is where "unconfigured"
// flips to "configured" mid-flow (the moment the connect mutation succeeds),
// and it deliberately keeps showing its confirmation + "Continue" until the
// user acts (see wizard-connect-view.tsx) — bouncing on that same state change
// would yank the confirmation away before it can be read. A user who already
// has an inventory before opening the wizard can never reach /welcome/connect
// in the first place, since /welcome itself redirects them away first.
const WIZARD_PATH = "/welcome";
const CONNECT_PATH = "/connect";

function isWizardRoute(pathname: string): boolean {
  return pathname === WIZARD_PATH || pathname.startsWith(`${WIZARD_PATH}/`);
}

export function FirstRunGate() {
  const { pathname } = useLocation();
  const firstRun = useFirstRun();
  const configured = useIsConfigured();

  const alreadyOnAFirstRunRoute =
    pathname === CONNECT_PATH || isWizardRoute(pathname);

  if (firstRun && !alreadyOnAFirstRunRoute) {
    return <Navigate to={WIZARD_PATH} replace />;
  }

  if (configured && pathname === WIZARD_PATH) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
