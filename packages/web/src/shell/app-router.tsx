import type { InventoryPrimitive, PrimitiveRef } from "@maestro/core";
import type { ComponentType } from "react";
import { Navigate, Route, Routes, useLocation, useParams } from "react-router";
import { ConnectView } from "../connect-gate/connect-view";
import { WelcomeView } from "../connect-gate/welcome-view";
import { DeployStateView } from "../deploy-state/deploy-state-view";
import { HarnessView } from "../harness/harness-view";
import {
  FIRST_INVENTORY_PATH,
  INVENTORY_VIEWS,
} from "../inventory/inventory-views";
import { PromptsPanel } from "../prompts/prompts-panel";
import { RepositoriesView } from "../registry/repositories-view";
import { AppearancePage } from "../settings/appearance-page";
import { HarnessLocationPage } from "../settings/harness-location-page";
import { HARNESS_LOCATION_PAGE } from "../settings/settings-pages";
import { SettingsShell } from "../settings/settings-shell";
import { SkillsPanel } from "../skills/skills-panel";
import { AppShell } from "./app-shell";
import { useDocumentTitle } from "./document-title";
import { GateShell } from "./gate-shell";

// Unmatched URLs go to the landing route, where the first-run gate decides
// cockpit vs connect gate.
export function AppRoutes() {
  useDocumentTitle();
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
        <Route
          path="inventory"
          element={<Navigate to={FIRST_INVENTORY_PATH} replace />}
        />
        <Route path="inventory/:view" element={<InventoryRoute />} />
        <Route path="repositories" element={<RepositoriesView />} />
        <Route path="harness" element={<HarnessScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

// Import local edits names the one skill it landed (#1249).
function HarnessScreen() {
  const state = useLocation().state as {
    openPrimitive?: PrimitiveRef;
  } | null;
  return <HarnessView openPrimitive={state?.openPrimitive ?? null} />;
}

// Keyed by the wire type, so a view type without a screen fails to compile.
const SCREEN_OF: Record<InventoryPrimitive["type"], ComponentType> = {
  skill: SkillsPanel,
  prompt: PromptsPanel,
};

// Each view's screen, by its segment. An unknown segment opens the first view.
function InventoryRoute() {
  const { view } = useParams();
  const match = INVENTORY_VIEWS.find((each) => each.segment === view);
  if (match === undefined) {
    return <Navigate to={FIRST_INVENTORY_PATH} replace />;
  }
  const Screen = SCREEN_OF[match.type];
  return <Screen />;
}
