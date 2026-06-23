import { Navigate, Outlet, useLocation } from "react-router-dom";
import { HttpError } from "../api/http";
import { useInventory } from "../inventory/use-inventory";

// First-run gate: when no inventory is configured the server answers the
// inventory read with 409, and the cockpit would otherwise dead-end on a "not
// configured" panel. Instead we route to the connect screen — the guided first
// step — unless the user is already there (so the connect form can do its job
// and Settings stays reachable). While the read is pending or successful, the
// requested view renders unchanged.
const CONNECT_PATH = "/connect";

export function FirstRunGate() {
  const { pathname } = useLocation();
  const inventory = useInventory();

  const notConfigured =
    inventory.isError &&
    inventory.error instanceof HttpError &&
    inventory.error.status === 409;

  if (notConfigured && pathname !== CONNECT_PATH) {
    return <Navigate to={CONNECT_PATH} replace />;
  }

  return <Outlet />;
}
