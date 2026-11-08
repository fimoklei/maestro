import type { BatchItemOutcome } from "@maestro/core";
import { useState } from "react";
import { GatedButton } from "../ui/gated-button";
import { useScreenWrites, useWriteAction } from "../ui/use-write-action";
import { PROPOSE_CHANGES, proposeBatchNotice } from "./propose-batch-copy";
import { ProposeBatchDialog } from "./propose-batch-dialog";
import { type BatchItem, batchRequest } from "./propose-batch-view";
import { useProposeBatch } from "./use-harness";

// The selection bar's Propose changes and the dialog it runs in.
export function ProposeBatchAction({
  chosen,
  origin,
  onSelectionSpent,
}: {
  /** The ticked rows, in table order. */
  chosen: readonly BatchItem[];
  /** The repository, host dropped: owner/repo. */
  origin: string;
  onSelectionSpent: () => void;
}) {
  // Held from the press, so a re-read under the dialog never renames its rows.
  const [items, setItems] = useState<readonly BatchItem[] | null>(null);
  // A batch with a deletion waits here until its confirmation is pressed.
  const [started, setStarted] = useState(false);
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

  const run = (sent: readonly BatchItem[]) => {
    setStarted(true);
    setOutcomes([]);
    write.run(sent.map(batchRequest));
  };
  const start = () => {
    const sent = [...chosen];
    setItems(sent);
    // A batch without a deletion runs at once.
    if (!sent.some((item) => item.change === "deletion")) {
      run(sent);
    }
  };
  const close = () => {
    const reported = batch.data !== undefined;
    setItems(null);
    setStarted(false);
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
        unavailable={null}
        onClick={start}
      />
      {items === null ? null : (
        <ProposeBatchDialog
          items={items}
          origin={origin}
          confirming={!started}
          outcomes={outcomes}
          running={write.phase === "running"}
          report={batch.data ?? null}
          failure={write.failure}
          onConfirm={() => run(items)}
          onClose={close}
        />
      )}
    </>
  );
}
