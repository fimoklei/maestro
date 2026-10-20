import type { HarnessStage, PrimitiveRef } from "@maestro/core";
import type { LinkTarget } from "../ui/phrase";

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
