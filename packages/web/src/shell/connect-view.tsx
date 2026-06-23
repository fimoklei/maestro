import { useNavigate } from "react-router-dom";
import { HttpError } from "../api/http";
import { useConnectInventory } from "../inventory/use-connect-inventory";
import { Card } from "../ui/card";
import { SectionHeader } from "../ui/section-header";
import { ConnectInventoryForm } from "./connect-inventory-form";

// The connect/settings view: point Maestro at an existing local agent-harness
// clone. Doubles as the first-run target (the gate routes here when no inventory
// is configured) and the Settings re-point screen. On a successful connect the
// inventory query is invalidated (in the hook) and the user lands on Inventory,
// which now lists the central skills. Server validation errors surface as
// readable text tied to the field.
export function ConnectView() {
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

  return (
    <section>
      <SectionHeader
        title="Connect inventory"
        meta="Point Maestro at your local agent-harness clone"
      />
      <Card>
        <ConnectInventoryForm
          onSubmit={handleSubmit}
          error={error}
          isPending={connect.isPending}
        />
      </Card>
    </section>
  );
}
