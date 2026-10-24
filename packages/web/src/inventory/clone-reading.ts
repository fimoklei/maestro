import type {
  HarnessPrimitiveType,
  PrimitiveDeletionCheck,
} from "@maestro/core";
import { HttpError } from "../api/http";
import {
  folderInClone,
  type useDeletionCheck,
  type useHarness,
} from "../harness/use-harness";

/** What this computer's clone says about deleting each primitive of one type (#1385). */
export type CloneReading =
  | { kind: "no-harness" | "checking" | "failed" }
  | { kind: "read"; checks: Record<string, PrimitiveDeletionCheck> };

// "No Working Harness" is the Harness read's own answer, not the check's.
export function cloneReading(
  harness: ReturnType<typeof useHarness>,
  check: ReturnType<typeof useDeletionCheck>,
  type: HarnessPrimitiveType,
): CloneReading {
  if (
    harness.error instanceof HttpError &&
    harness.error.code === "not-configured"
  ) {
    return { kind: "no-harness" };
  }
  if (check.isError) {
    return { kind: "failed" };
  }
  return check.data === undefined
    ? { kind: "checking" }
    : { kind: "read", checks: check.data[type] };
}

export const inClone = (clone: CloneReading, name: string) =>
  folderInClone(clone.kind === "read" ? clone.checks[name] : undefined);

// Last, as a danger item. As on Harness, dim while the clone's read is
// unsettled and omitted where the clone can never take it (#1485).
export const deleteItem = (clone: CloneReading, name: string, label: string) =>
  clone.kind === "no-harness" ||
  (clone.kind === "read" && inClone(clone, name) === null)
    ? []
    : [
        {
          action: "delete" as const,
          label,
          danger: true,
          disabled: clone.kind !== "read",
        },
      ];
