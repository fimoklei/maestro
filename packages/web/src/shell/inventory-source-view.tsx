import { useState } from "react";
import {
  connectErrorMessage,
  isNoUsableOriginError,
} from "../inventory/connect-error-message";
import { useConnectInventory } from "../inventory/use-connect-inventory";
import { useInventory, useInventoryConfig } from "../inventory/use-inventory";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { SectionHeader } from "../ui/section-header";
import { BrowseDialog } from "./browse-dialog";
import { ConnectInventoryForm } from "./connect-inventory-form";
import { primitiveCountLabel } from "./primitive-count-label";
import { useBrowsePicker } from "./use-browse-picker";
import { useRereadInventory } from "./use-reread-inventory";

// The steady-state ⚙ Inventory source view for a connected user (issue #98,
// design frames inv-source-path / src-change-path). Distinct from the ▤
// Inventory catalogue (which lists primitives) and from the connect gate:
// this screen owns the *connection* — it shows what Maestro is pointed at and
// its live primitive count, re-reads on demand, and is where re-pointing lives
// now that the connect gate owns cold-start. Offline read-on-demand: no sync job, no
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
  // While a read is in flight the badge shows "reading…" even though Query still
  // holds the previous count. That in-flight text is what makes the live region
  // announce on *every* re-read — a same-count refresh settling back from
  // "reading…" to "N primitives" is still a genuine mutation a screen reader
  // hears (issue #230). Belt-and-suspenders: primitiveCountLabel also maps an
  // as-yet-unknown count to "reading…".
  const countLabel = inventory.isFetching
    ? "reading…"
    : primitiveCountLabel(inventory.data?.primitives.length);

  const [isChanging, setIsChanging] = useState(false);
  // The field seeds from the current path (edit it to re-point) but a browse
  // selection or keystroke overwrites it — same controlled-form pattern as the
  // connect gate's connect screen (see connect-inventory-form.tsx).
  const [editedPath, setEditedPath] = useState<string | undefined>(undefined);
  const path = editedPath ?? currentPath ?? "";
  // Connect mode confirms exactly one path; the list shape is the dialog's,
  // not this form's.
  const browse = useBrowsePicker(([selected]) => setEditedPath(selected));

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
              noUsableOrigin={isNoUsableOriginError(connect.error)}
              isPending={connect.isPending}
              onBrowse={browse.openBrowse}
              submitLabel="Re-point source"
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
            {/* A read in flight always shows the status region, even when the
                last read errored: on a retry Query keeps isError true while it
                still holds the last count, and ceding to the error alert here
                would unmount the live region so the recovered count mounts
                fresh and goes unannounced (issue #230). */}
            {!inventory.isFetching && inventory.isError ? (
              <p
                role="alert"
                className="rounded-control border border-amber-border bg-amber-bg px-3 py-2 text-amber-ink text-tag"
              >
                ▲ could not read the inventory — re-read to retry
              </p>
            ) : (
              <p
                role="status"
                // The connected badge quiets to a neutral state while a re-read
                // is in flight, then settles back to green when the fresh count
                // lands — that colour settle is the confirmation (issue #230).
                // Only the design system's one allowed motion is used: a
                // background/border-colour transition, gated behind motion-safe
                // so prefers-reduced-motion gets the change instantly.
                className={`rounded-control border px-3 py-2 text-tag motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out ${
                  inventory.isFetching
                    ? "border-line-chip bg-dim-bg text-dim"
                    : "border-green-border bg-green-bg text-green-ink"
                }`}
              >
                ● connected · {countLabel}
              </p>
            )}
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
                {inventory.isFetching ? "reading…" : "Re-read"}
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
          mode="connect"
          onSelect={browse.selectBrowse}
          onClose={browse.closeBrowse}
        />
      ) : null}
    </section>
  );
}
