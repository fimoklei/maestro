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

// A write to the working tree lands in Pending proposal, even where the
// primitive also holds a later row (#865).
/** A primitive's Pending proposal row, by the Harness screen's row id. */
export const proposalRow = (ref: PrimitiveRef) =>
  rowId({ ...ref, stage: "pending-proposal" });

/** What a navigation to the Harness screen carries. */
export type HarnessArrival = {
  openPrimitive?: OpenPrimitive;
  /** A write that ended here; the screen says it once its read lands. */
  written?: WriteResult;
};

const STAGES = [
  "pending-proposal",
  "pending-review",
  "pending-release",
] as const satisfies readonly HarnessStage[];

const TYPES = [
  "skill",
  "prompt",
] as const satisfies readonly PrimitiveRef["type"][];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

function openPrimitiveFrom(value: unknown): OpenPrimitive | undefined {
  if (!isRecord(value)) return undefined;
  const type = TYPES.find((each) => each === value.type);
  const { name } = value;
  if (type === undefined || typeof name !== "string") return undefined;
  if (value.stage === undefined) return { type, name };
  const stage = STAGES.find((each) => each === value.stage);
  return stage === undefined ? undefined : { type, name, stage };
}

function isPart(
  part: unknown,
): part is WriteResult["sentence"]["parts"][number] {
  if (typeof part === "string") return true;
  if (!isRecord(part) || typeof part.text !== "string") return false;
  if (part.kind === "name" || part.kind === "machine") return true;
  return (
    part.kind === "link" &&
    isRecord(part.to) &&
    typeof part.to.pathname === "string"
  );
}

function writtenFrom(value: unknown): WriteResult | undefined {
  if (!isRecord(value) || !isRecord(value.sentence)) return undefined;
  const { parts } = value.sentence;
  if (!Array.isArray(parts) || !parts.every(isPart)) return undefined;
  const sentence = { parts };
  if (value.leftItsRow === true) return { sentence, leftItsRow: true };
  const { row } = value;
  return row === null || typeof row === "string"
    ? { sentence, row }
    : undefined;
}

/** A navigation's state as the Harness screen reads it; history can hold anything. */
export function harnessArrival(state: unknown): HarnessArrival {
  if (!isRecord(state)) return {};
  return {
    openPrimitive: openPrimitiveFrom(state.openPrimitive),
    written: writtenFrom(state.written),
  };
}
