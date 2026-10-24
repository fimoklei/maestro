import type { HarnessStage, PrimitiveRef } from "@maestro/core";
import type { LinkTarget } from "../ui/phrase";
import type { WriteResult } from "../ui/use-write-action";
import { rowId } from "./harness-columns";

// Without a stage, the Harness screen opens the row's Pending proposal: the
// stage a primitive lands in after Import local edits or Delete skill.
export type OpenPrimitive = PrimitiveRef & { stage?: HarnessStage };

/** The Harness screen with one row selected and its pane open. */
export const harnessRow = (
  ref: PrimitiveRef,
  stage: HarnessStage,
): LinkTarget => ({
  pathname: "/harness",
  state: {
    openPrimitive: { ...ref, stage } satisfies OpenPrimitive,
  },
});

/** A primitive's Pending proposal row, by the Harness screen's row id. */
export const proposalRow = (ref: PrimitiveRef) =>
  rowId({ ...ref, stage: "pending-proposal" });

/** What a navigation to the Harness screen carries. */
export type HarnessArrival = {
  openPrimitive?: OpenPrimitive;
  /** A write that ended here; the screen says it once its read lands. */
  written?: WriteResult;
};
