import { useState } from "react";
import { useInventory, useInventoryConfig } from "../inventory/use-inventory";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Notice, type NoticeContent } from "../ui/notice";
import { SectionHeader } from "../ui/section-header";
import { ConnectInventoryPanel } from "./connect-inventory-panel";
import { primitiveCountLabel } from "./primitive-count-label";
import { SourceLabel } from "./source-label";
import { useRereadInventory } from "./use-reread-inventory";

// Steady-state ⚙ view (#98). Offline read-on-demand: no sync job. "Change
// source" flips the same card to ConnectInventoryPanel (PRD #93).

// Shared by skeleton and settled view so the loading frame can't drift and
// reintroduce the layout jump this view exists to prevent (#231).
const SOURCE_TITLE = "Inventory source";
const SOURCE_META = "local path · read-only";
const SOURCE_CARD_WIDTH = "max-w-lg";

// The Re-read button sits directly below, so the notice carries no action of
// its own — a second copy of the same control would compete with it.
const READ_FAILED: NoticeContent = {
  level: "error",
  label: "the inventory did not load",
  message:
    "The folder below may have moved, or its apm.yml may no longer be readable. Check the path, then re-read.",
};

export function InventorySourceView() {
  const config = useInventoryConfig();
  const inventory = useInventory();
  const reread = useRereadInventory();
  const currentPath = config.data?.inventoryPath ?? null;
  // "reading…" while in flight makes the live region announce on every
  // re-read, even a same-count refresh — a genuine mutation a screen reader
  // must hear (#230).
  const countLabel = inventory.isFetching
    ? "reading…"
    : primitiveCountLabel(inventory.data?.primitives.length);

  // A refetch in flight is not a failure yet: the last good count holds.
  const failed = !inventory.isFetching && inventory.isError;

  const [isChanging, setIsChanging] = useState(false);

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
          <ConnectInventoryPanel
            initialPath={currentPath ?? ""}
            onSuccess={() => setIsChanging(false)}
            submitLabel="Re-point source"
            secondaryAction={
              <Button
                type="button"
                variant="quiet"
                size="sm"
                onClick={() => setIsChanging(false)}
              >
                Cancel
              </Button>
            }
          />
        ) : (
          <div className="flex flex-col gap-3">
            {/* The notice region outlives its content (#465, decision 12), and
                a panel that failed to read is always trigger="load" — one
                block for a first read, a retry and a refetch on focus. */}
            <Notice trigger="load" notice={failed ? READ_FAILED : null} />
            {/* The count pill stays mounted through a retry, even if the last
                read errored: unmounting it would leave the recovered count
                unannounced (#230). */}
            {failed ? null : (
              <p
                role="status"
                // Count only, not a second "connected" signal — the top bar
                // already owns that (#231). Colour settle to green is the
                // re-read confirmation (#230).
                className={`rounded-control border px-3 py-2 text-tag motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out ${
                  inventory.isFetching
                    ? "border-line-chip bg-dim-bg text-dim"
                    : "border-green-border bg-green-bg text-green-ink"
                }`}
              >
                ● {countLabel}
              </p>
            )}
            <SourceLabel path={currentPath ?? ""} />
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
    </section>
  );
}

// Placeholder bars reuse the settled elements' own box classes, so height
// matches by construction rather than hand-picked pixels that drift (#231).
// Static only — no pulse (DESIGN.md's one allowed motion is the pill settle).
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
