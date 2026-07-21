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

// The frame the skeleton and the settled view must render identically — share
// them so the loading frame can't drift from the real one and bring back the
// layout jump this view exists to prevent (issue #231).
const SOURCE_TITLE = "Inventory source";
const SOURCE_META = "local path · read-only";
const SOURCE_CARD_WIDTH = "max-w-lg";

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
    return <SourceSkeleton />;
  }

  return (
    <section>
      <SectionHeader
        title={isChanging ? "Change inventory source" : SOURCE_TITLE}
        meta={isChanging ? "re-point at another local folder" : SOURCE_META}
      />
      <Card padded className={SOURCE_CARD_WIDTH}>
        {isChanging ? (
          <ConnectInventoryForm
            path={path}
            onPathChange={setEditedPath}
            onSubmit={handleSubmit}
            error={connectErrorMessage(connect.error)}
            noUsableOrigin={isNoUsableOriginError(connect.error)}
            isPending={connect.isPending}
            onBrowse={browse.openBrowse}
            submitLabel="Re-point source"
            secondaryAction={
              <Button
                type="button"
                variant="quiet"
                size="sm"
                onClick={stopChanging}
              >
                Cancel
              </Button>
            }
          />
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
                // The count badge — not a second "connected" signal. The top bar
                // already owns the connection state (its chip + dot); repeating
                // "connected" here showed the same state twice, so this badge
                // carries only the source's live primitive count (issue #231).
                // It still quiets to neutral while a re-read is in flight, then
                // settles back to green when the fresh count lands — that colour
                // settle is the re-read confirmation (issue #230). Only the
                // design system's one allowed motion is used: a
                // background/border-colour transition, gated behind motion-safe
                // so prefers-reduced-motion gets the change instantly.
                className={`rounded-control border px-3 py-2 text-tag motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out ${
                  inventory.isFetching
                    ? "border-line-chip bg-dim-bg text-dim"
                    : "border-green-border bg-green-bg text-green-ink"
                }`}
              >
                ● {countLabel}
              </p>
            )}
            <div className="flex flex-col gap-1">
              <span className="m-label">Source · local folder</span>
              <span
                className="truncate font-mono text-fg text-mono-sm"
                title={currentPath ?? undefined}
              >
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

// The loading state holds the real frame — same heading, same card outline — and
// fills the card body with placeholder bars that reuse the settled elements'
// own box classes (padding, border, text size), with transparent text standing
// in for the real copy. Height therefore equals the settled content by
// construction — not by hand-picked pixel values that drift and reintroduce the
// very layout jump this view exists to prevent (issue #231; Codex review).
// Static only: the design system allows just one motion (the pill's colour
// settle), so no pulse. The bars are decorative; a role="status" wrapper
// announces "Loading source…" to assistive tech instead of the old bare
// "Loading…" paragraph.
function SourceSkeleton() {
  return (
    <section>
      <SectionHeader title={SOURCE_TITLE} meta={SOURCE_META} />
      <Card padded className={SOURCE_CARD_WIDTH}>
        <div
          role="status"
          aria-label="Loading source…"
          aria-busy="true"
          className="flex flex-col gap-3"
        >
          {/* Same box as the status pill: border + px-3 py-2 + text-tag. */}
          <div
            aria-hidden="true"
            className="rounded-control border border-line-chip bg-dim-bg px-3 py-2 text-tag text-transparent"
          >
            ● loading
          </div>
          {/* Same box as the "Source · local folder" label + path rows. */}
          <div aria-hidden="true" className="flex flex-col gap-1">
            <span className="m-label w-28 rounded bg-dim-bg text-transparent">
              label
            </span>
            <span className="w-64 max-w-full truncate rounded bg-dim-bg font-mono text-mono-sm text-transparent">
              /loading/source/path
            </span>
          </div>
          {/* Same box as the two sm buttons: border + px-2 py-[3px] + text-tag. */}
          <div aria-hidden="true" className="flex gap-2">
            <span className="rounded-control border border-line-chip bg-dim-bg px-2 py-[3px] text-tag text-transparent">
              Re-read
            </span>
            <span className="rounded-control border border-line-chip bg-dim-bg px-2 py-[3px] text-tag text-transparent">
              Change source
            </span>
          </div>
        </div>
      </Card>
    </section>
  );
}
