import type { BatchItemOutcome } from "@maestro/core";
import { useState } from "react";
import { GatedButton } from "../ui/gated-button";
import { useScreenWrites, useWriteAction } from "../ui/use-write-action";
import {
  DESELECT_DELETED,
  PROPOSE_CHANGES,
  proposeBatchNotice,
} from "./propose-batch-copy";
import { ProposeBatchDialog } from "./propose-batch-dialog";
import type { BatchItem } from "./propose-batch-view";
import { useProposeBatch } from "./use-harness";

// The selection bar's Propose changes and the dialog it runs in.
export function ProposeBatchAction({
  chosen,
  onSelectionSpent,
}: {
  /** The ticked rows, in table order. */
  chosen: readonly BatchItem[];
  onSelectionSpent: () => void;
}) {
  // Held from the press, so a re-read under the dialog never renames its rows.
  const [items, setItems] = useState<readonly BatchItem[] | null>(null);
  // Each item's outcome, in the order the batch finished them.
  const [outcomes, setOutcomes] = useState<readonly BatchItemOutcome[]>([]);
  const batch = useProposeBatch((outcome) =>
    setOutcomes((held) => [...held, outcome]),
  );
  // The dialog keeps its Report; the screen hears the busy label and the end.
  const write = useWriteAction(batch, {
    screen: useScreenWrites(),
    action: "propose",
    subject: () => null,
    failure: proposeBatchNotice,
  });

  const start = () => {
    const sent = [...chosen];
    setItems(sent);
    setOutcomes([]);
    write.run(sent.map(({ type, name }) => ({ type, name })));
  };
  const close = () => {
    const reported = batch.data !== undefined;
    setItems(null);
    setOutcomes([]);
    batch.reset();
    if (reported) onSelectionSpent();
  };

  return (
    <>
      <GatedButton
        variant="primary"
        size="sm"
        label={PROPOSE_CHANGES}
        unavailable={
          chosen.some((item) => item.change === "deletion")
            ? DESELECT_DELETED
            : null
        }
        onClick={start}
      />
      {items === null ? null : (
        <ProposeBatchDialog
          items={items}
          outcomes={outcomes}
          running={write.phase === "running"}
          report={batch.data ?? null}
          failure={write.failure}
          onClose={close}
        />
      )}
    </>
  );
}
