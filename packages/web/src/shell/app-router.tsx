import { Navigate, Route, Routes } from "react-router";
import { ConnectView } from "../connect-gate/connect-view";
import { WelcomeView } from "../connect-gate/welcome-view";
import { DeployStateView } from "../deploy-state/deploy-state-view";
import { HarnessView } from "../harness/harness-view";
import { InventoryPanel } from "../inventory/inventory-panel";
import { RepositoriesView } from "../registry/repositories-view";
import { AppearancePage } from "../settings/appearance-page";
import { HarnessLocationPage } from "../settings/harness-location-page";
import { HARNESS_LOCATION_PAGE } from "../settings/settings-pages";
import { SettingsShell } from "../settings/settings-shell";
import { AppShell } from "./app-shell";
import { GateShell } from "./gate-shell";

// Deploy-state is the landing route. /welcome + /welcome/connect are the
// connect gate's two screens (ADR-0015) and sit in their own frame (#991);
// Settings is the third frame (#995).
// Catch-all sends unmatched URLs to the landing route, where the first-run
// gate decides cockpit vs connect gate.
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<GateShell />}>
        <Route path="welcome" element={<WelcomeView />} />
        <Route path="welcome/connect" element={<ConnectView />} />
      </Route>
      <Route path="settings" element={<SettingsShell />}>
        <Route
          index
          element={<Navigate to={HARNESS_LOCATION_PAGE.to} replace />}
        />
        <Route path="harness-location" element={<HarnessLocationPage />} />
        <Route path="appearance" element={<AppearancePage />} />
      </Route>
      <Route element={<AppShell />}>
        <Route index element={<DeployStateView />} />
        <Route path="inventory" element={<InventoryPanel />} />
        <Route path="repositories" element={<RepositoriesView />} />
        <Route path="harness" element={<HarnessView />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
