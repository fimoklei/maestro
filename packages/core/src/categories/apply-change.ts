// One change to a Harness's category record, pure: every change kind runs here.
import { type PrimitiveRef, primitiveKey } from "../harness/harness-primitive";
import {
  categoryNameProblem,
  sameCategoryName,
  trimCategoryName,
} from "./category-name";
import type { CategoryRecord } from "./category-section";
import type { HeldItems } from "./held-items";

export type CategoryChange =
  | { kind: "add"; name: string }
  | { kind: "assign"; items: PrimitiveRef[]; category: string | null };

export type AppliedChange =
  | { ok: true; record: CategoryRecord; added?: string }
  | { ok: false; error: "name-exists"; existing: string }
  | {
      ok: false;
      error: "name-invalid" | "category-not-found" | "item-not-found";
    };

/** The record without entries for items the Harness no longer holds; null held drops none. */
export const withoutStale = (
  record: CategoryRecord,
  held: HeldItems | null,
): CategoryRecord =>
  held === null
    ? record
    : {
        ...record,
        assignments: record.assignments.filter((each) => held.holds(each)),
      };

const assign = (
  record: CategoryRecord,
  change: Extract<CategoryChange, { kind: "assign" }>,
  held: HeldItems | null,
): AppliedChange => {
  const category =
    change.category === null
      ? null
      : record.names.find((name) =>
          sameCategoryName(name, trimCategoryName(change.category ?? "")),
        );
  if (category === undefined) return { ok: false, error: "category-not-found" };
  if (held !== null && !change.items.every((item) => held.holds(item))) {
    return { ok: false, error: "item-not-found" };
  }
  const keys = new Set(change.items.map(primitiveKey));
  const kept = record.assignments.filter(
    (each) => !keys.has(primitiveKey(each)),
  );
  const unique = [
    ...new Map(change.items.map((item) => [primitiveKey(item), item])).values(),
  ];
  return {
    ok: true,
    record: {
      ...record,
      assignments:
        category === null
          ? kept
          : [
              ...kept,
              ...unique.map(({ type, name }) => ({ type, name, category })),
            ],
    },
  };
};

export const applyChange = (
  record: CategoryRecord,
  change: CategoryChange,
  held: HeldItems | null,
): AppliedChange => {
  switch (change.kind) {
    case "add": {
      const name = trimCategoryName(change.name);
      if (categoryNameProblem(name) !== null) {
        return { ok: false, error: "name-invalid" };
      }
      const existing = record.names.find((each) =>
        sameCategoryName(each, name),
      );
      if (existing !== undefined) {
        return { ok: false, error: "name-exists", existing };
      }
      return {
        ok: true,
        record: { ...record, names: [...record.names, name] },
        added: name,
      };
    }
    case "assign":
      return assign(record, change, held);
  }
};
