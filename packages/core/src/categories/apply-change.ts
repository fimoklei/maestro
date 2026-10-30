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
  | { kind: "rename"; from: string; to: string }
  | { kind: "delete"; name: string; moveTo: string | null }
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

/** The stored name the given name matches, ignoring case and outer spaces. */
const storedName = (record: CategoryRecord, name: string): string | undefined =>
  record.names.find((each) => sameCategoryName(each, trimCategoryName(name)));

// A case-only rename keeps its slot; only another category's name is taken.
const rename = (
  record: CategoryRecord,
  change: Extract<CategoryChange, { kind: "rename" }>,
): AppliedChange => {
  const from = storedName(record, change.from);
  if (from === undefined) return { ok: false, error: "category-not-found" };
  const to = trimCategoryName(change.to);
  if (categoryNameProblem(to) !== null) {
    return { ok: false, error: "name-invalid" };
  }
  const existing = record.names.find(
    (each) => each !== from && sameCategoryName(each, to),
  );
  if (existing !== undefined) {
    return { ok: false, error: "name-exists", existing };
  }
  return {
    ok: true,
    record: {
      ...record,
      names: record.names.map((each) => (each === from ? to : each)),
      assignments: record.assignments.map((each) =>
        each.category === from ? { ...each, category: to } : each,
      ),
    },
  };
};

// The destination must outlive the delete, so the category itself is none.
const remove = (
  record: CategoryRecord,
  change: Extract<CategoryChange, { kind: "delete" }>,
): AppliedChange => {
  const name = storedName(record, change.name);
  if (name === undefined) return { ok: false, error: "category-not-found" };
  const moveTo =
    change.moveTo === null ? null : storedName(record, change.moveTo);
  if (moveTo === undefined || moveTo === name) {
    return { ok: false, error: "category-not-found" };
  }
  return {
    ok: true,
    record: {
      ...record,
      names: record.names.filter((each) => each !== name),
      assignments: record.assignments.flatMap((each) =>
        each.category !== name
          ? [each]
          : moveTo === null
            ? []
            : [{ ...each, category: moveTo }],
      ),
    },
  };
};

const assign = (
  record: CategoryRecord,
  change: Extract<CategoryChange, { kind: "assign" }>,
  held: HeldItems | null,
): AppliedChange => {
  const category =
    change.category === null ? null : storedName(record, change.category);
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
    case "rename":
      return rename(record, change);
    case "delete":
      return remove(record, change);
    case "assign":
      return assign(record, change, held);
  }
};
