import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useInventoryConfig } from "../inventory/use-inventory";

// First-run gate: when no inventory path is configured the cockpit would
// dead-end on a "not configured" panel. Instead we route to the connect screen —
// the guided first step — unless the user is already there (so the connect form
// can do its job and Settings stays reachable). The signal is the config
// endpoint, which answers 200 with inventoryPath null when nothing is connected:
// a success response, so there is no retry delay before the redirect (unlike
// keying off an error). While the config is still loading, the requested view
// renders unchanged.
const CONNECT_PATH = "/connect";

export function FirstRunGate() {
  const { pathname } = useLocation();
  const config = useInventoryConfig();

  const notConfigured = config.isSuccess && config.data.inventoryPath === null;

  if (notConfigured && pathname !== CONNECT_PATH) {
    return <Navigate to={CONNECT_PATH} replace />;
  }

  return <Outlet />;
}
