import { useState } from "react";
import { connectErrorMessage } from "../inventory/connect-error-message";
import { useConnectInventory } from "../inventory/use-connect-inventory";
import { useInventory, useInventoryConfig } from "../inventory/use-inventory";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { SectionHeader } from "../ui/section-header";
import { BrowseDialog } from "./browse-dialog";
import { ConnectInventoryForm } from "./connect-inventory-form";
import { useBrowsePicker } from "./use-browse-picker";
import { useRereadInventory } from "./use-reread-inventory";

// The steady-state ⚙ Inventory source view for a connected user (issue #98,
// design frames inv-source-path / src-change-path). Distinct from the ▤
// Inventory catalogue (which lists primitives) and from the first-run wizard:
// this screen owns the *connection* — it shows what Maestro is pointed at and
// its live primitive count, re-reads on demand, and is where re-pointing lives
// now that the wizard owns cold-start. Offline read-on-demand: no sync job, no
// "synced 2m ago" timestamp — the count is whatever the last inventory read
// returned, refreshed only when the user re-reads.
//
// "Change source" flips the same card to the shared ConnectInventoryForm (PRD
// #93) rather than a separate route, so the ⚙ nav stays active throughout. A
// successful re-point invalidates the inventory (in the connect hook) and drops
// back to the connected view, now pointed at the new source.
export function InventorySourceView() {
  const config = useInventoryConfig();
  const inventory = useInventory();
  const connect = useConnectInventory();
  const reread = useRereadInventory();
  const currentPath = config.data?.inventoryPath ?? null;
  // The count comes from a separate query than the config, so it can still be
  // resolving after the path is known — show "reading…" rather than a bare
  // "undefined", and singularise a count of one.
  const count = inventory.data?.primitives.length;
  const countLabel =
    count === undefined
      ? "reading…"
      : `${count} ${count === 1 ? "primitive" : "primitives"}`;

  const [isChanging, setIsChanging] = useState(false);
  // The field seeds from the current path (edit it to re-point) but a browse
  // selection or keystroke overwrites it — same controlled-form pattern as the
  // wizard's connect step (see connect-inventory-form.tsx).
  const [editedPath, setEditedPath] = useState<string | undefined>(undefined);
  const path = editedPath ?? currentPath ?? "";
  const browse = useBrowsePicker(setEditedPath);

  function stopChanging() {
    setIsChanging(false);
    setEditedPath(undefined);
    connect.reset();
  }

  function handleSubmit(submittedPath: string) {
    connect.mutate(submittedPath, { onSuccess: stopChanging });
  }

  if (config.isPending) {
    return <p className="text-dim text-tag">Loading…</p>;
  }

  return (
    <section>
      <SectionHeader
        title={isChanging ? "Change inventory source" : "Inventory source"}
        meta={
          isChanging
            ? "re-point at another local folder"
            : "local path · read-only"
        }
      />
      <Card padded className="max-w-lg">
        {isChanging ? (
          <div className="flex flex-col gap-3">
            <ConnectInventoryForm
              path={path}
              onPathChange={setEditedPath}
              onSubmit={handleSubmit}
              error={connectErrorMessage(connect.error)}
              isPending={connect.isPending}
              onBrowse={browse.openBrowse}
            />
            <div>
              <Button
                type="button"
                variant="quiet"
                size="sm"
                onClick={stopChanging}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="rounded-control border border-green-border bg-green-bg px-3 py-2 text-green-ink text-tag">
              ● connected · {countLabel}
            </p>
            <div className="flex flex-col gap-1">
              <span className="m-label">Source · local folder</span>
              <span className="font-mono text-fg text-mono-sm">
                {currentPath}
              </span>
            </div>
            <div className="flex gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={reread}
                disabled={inventory.isFetching}
              >
                Re-read
              </Button>
              <Button
                variant="quiet"
                size="sm"
                onClick={() => setIsChanging(true)}
              >
                Change source
              </Button>
            </div>
          </div>
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
