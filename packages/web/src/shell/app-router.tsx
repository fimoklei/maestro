import { Navigate, Route, Routes } from "react-router";
import { ConnectView } from "../connect-gate/connect-view";
import { WelcomeView } from "../connect-gate/welcome-view";
import { DeployStateView } from "../deploy-state/deploy-state-view";
import { InventoryPanel } from "../inventory/inventory-panel";
import { AppShell } from "./app-shell";
import { InventorySourceView } from "./inventory-source-view";

// Deploy-state is the landing route. /welcome + /welcome/connect are the
// connect gate's two screens (ADR-0015). Catch-all sends unmatched URLs to
// the landing route, where the first-run gate decides cockpit vs connect gate.
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<DeployStateView />} />
        <Route path="inventory" element={<InventoryPanel />} />
        <Route path="source" element={<InventorySourceView />} />
        <Route path="welcome" element={<WelcomeView />} />
        <Route path="welcome/connect" element={<ConnectView />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
