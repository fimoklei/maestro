import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { connectErrorMessage } from "../inventory/connect-error-message";
import { useConnectInventory } from "../inventory/use-connect-inventory";
import { useInventoryConfig } from "../inventory/use-inventory";
import { Card } from "../ui/card";
import { SectionHeader } from "../ui/section-header";
import { BrowseDialog } from "./browse-dialog";
import { ConnectInventoryForm } from "./connect-inventory-form";
import { useBrowsePicker } from "./use-browse-picker";

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
  const currentPath = config.data?.inventoryPath ?? null;
  // Lifted out of the form (which is now controlled, see connect-inventory-form
  // .tsx) so a browse-dialog selection can overwrite it the same way typing
  // does. Starts undefined ("not yet touched") rather than seeding from
  // currentPath directly — the config query is still pending on first render,
  // so seeding eagerly would freeze the field at "" before the real path
  // arrives. Once the user types or browses, that edit wins over config.
  const [editedPath, setEditedPath] = useState<string | undefined>(undefined);
  const path = editedPath ?? currentPath ?? "";
  const browse = useBrowsePicker(setEditedPath);

  function handleSubmit(submittedPath: string) {
    connect.mutate(submittedPath, {
      onSuccess: () => navigate("/inventory"),
    });
  }

  const error = connectErrorMessage(connect.error);

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
            from the current path. */}
        {config.isPending ? (
          <p className="text-dim text-tag">Loading…</p>
        ) : (
          <ConnectInventoryForm
            path={path}
            onPathChange={setEditedPath}
            onSubmit={handleSubmit}
            error={error}
            isPending={connect.isPending}
            onBrowse={browse.openBrowse}
          />
        )}
      </Card>
      {browse.open ? (
        <BrowseDialog
          onSelect={browse.selectBrowse}
          onClose={browse.closeBrowse}
        />
      ) : null}
    </section>
  );
}
