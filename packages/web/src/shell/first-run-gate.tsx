import { Navigate, Outlet, useLocation } from "react-router";
import { ConfigUnreachableNotice } from "../inventory/config-unreachable-notice";
import { LOADING_INVENTORY_CONNECTION } from "../inventory/inventory-copy";
import { useInventoryConfig } from "../inventory/use-inventory";
import { useFirstRun, useIsConfigured } from "./use-first-run";

// Unconfigured -> routed to the connect gate (ADR-0015). Reverse holds too
// (#96): a configured user deep-linking to /welcome bounces out, even during
// the pending window — or WelcomeView flashes before the redirect runs.
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
      // Without this, a failed query sits on the loading line forever (#103).
      return <ConfigUnreachableNotice onRetry={() => config.refetch()} />;
    }
    if (!firstRun) {
      return (
        <p className="sr-only">
          {LOADING_INVENTORY_CONNECTION}
        </p>
      );
    }
  }

  return <Outlet />;
}
