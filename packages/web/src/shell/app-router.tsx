import { Route, Routes } from "react-router-dom";
import { DeployStateView } from "../deploy-state/deploy-state-view";
import { InventoryView } from "../inventory/inventory-view";
import { WelcomeView } from "../wizard/welcome-view";
import { WizardConnectView } from "../wizard/wizard-connect-view";
import { WizardReposView } from "../wizard/wizard-repos-view";
import { AppShell } from "./app-shell";
import { InventorySourceView } from "./inventory-source-view";

// The cockpit's route table. Deploy-state is the landing route (the signal you
// want first); Inventory and the ⚙ Inventory source view fill in over later
// slices. /welcome, /welcome/connect and /welcome/repos are the first-run
// wizard (issues #96/#97) — the gate routes an unconfigured user here instead
// of a bare connect form. /source is the connected-user Inventory source view
// (issue #98): connection status + re-read + change-source re-point. All views
// nest under AppShell so they share the sidebar + status bar chrome.
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<DeployStateView />} />
        <Route path="inventory" element={<InventoryView />} />
        <Route path="source" element={<InventorySourceView />} />
        <Route path="welcome" element={<WelcomeView />} />
        <Route path="welcome/connect" element={<WizardConnectView />} />
        <Route path="welcome/repos" element={<WizardReposView />} />
      </Route>
    </Routes>
  );
}
