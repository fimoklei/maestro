import { DeployStateSection } from "./deploy-state/deploy-state-section";
import { InventoryPanel } from "./inventory/inventory-panel";
import { RegistryPanel } from "./registry/registry-panel";
import { useHealth } from "./use-health";

// Minimal shell, no Maestro UI: reads /api/health and shows the status. Its
// only purpose is to prove the live web -> server HTTP boundary works.
type HealthState = "checking" | "healthy" | "unreachable";

export function App() {
  const health = useHealth();
  const state: HealthState = health.isPending
    ? "checking"
    : health.isError || !health.data?.ok
      ? "unreachable"
      : "healthy";

  return (
    <main>
      <h1>Maestro</h1>
      <p>Server: {state}</p>
      <RegistryPanel />
      <DeployStateSection />
      <InventoryPanel />
    </main>
  );
}
