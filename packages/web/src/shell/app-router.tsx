import { Route, Routes } from "react-router-dom";
import { DeployStateView } from "../deploy-state/deploy-state-view";
import { InventoryView } from "../inventory/inventory-view";
import { AppShell } from "./app-shell";
import { ConnectView } from "./connect-view";

// The cockpit's route table. Deploy-state is the landing route (the signal you
// want first); Inventory and the connect/settings view fill in over later
// slices. All views nest under AppShell so they share the sidebar + status bar
// chrome.
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<DeployStateView />} />
        <Route path="inventory" element={<InventoryView />} />
        <Route path="connect" element={<ConnectView />} />
      </Route>
    </Routes>
  );
}
