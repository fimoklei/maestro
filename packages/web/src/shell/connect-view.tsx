import { useNavigate } from "react-router-dom";
import { HttpError } from "../api/http";
import { useConnectInventory } from "../inventory/use-connect-inventory";
import { useInventoryConfig } from "../inventory/use-inventory";
import { Card } from "../ui/card";
import { SectionHeader } from "../ui/section-header";
import { ConnectInventoryForm } from "./connect-inventory-form";

// The connect/settings view: point Maestro at an existing local agent-harness
// clone. Doubles as the first-run target (the gate routes here when no inventory
// is configured) and the Settings re-point screen — which shows the currently
// connected path and pre-fills the field with it. On a successful connect the
// inventory queries are invalidated (in the hook) and the user lands on
// Inventory. Server validation errors surface as readable text tied to the field.
export function ConnectView() {
  const config = useInventoryConfig();
  const connect = useConnectInventory();
  const navigate = useNavigate();

  function handleSubmit(path: string) {
    connect.mutate(path, {
      onSuccess: () => navigate("/inventory"),
    });
  }

  const error =
    connect.error instanceof HttpError
      ? connect.error.message
      : connect.error
        ? "Could not connect the inventory."
        : null;

  const currentPath = config.data?.inventoryPath ?? null;

  return (
    <section>
      <SectionHeader
        title="Connect inventory"
        meta="Point Maestro at your local agent-harness clone"
      />
      <Card>
        {currentPath ? (
          <p className="mb-3 text-green-ink text-tag">
            ✓ Connected — re-point below if your clone moved.
          </p>
        ) : null}
        {/* Mount the form only once the config has resolved so its field seeds
            from the current path (the input is uncontrolled-by-prop after mount). */}
        {config.isPending ? (
          <p className="text-dim text-tag">Loading…</p>
        ) : (
          <ConnectInventoryForm
            onSubmit={handleSubmit}
            initialPath={currentPath ?? ""}
            error={error}
            isPending={connect.isPending}
          />
        )}
      </Card>
    </section>
  );
}
