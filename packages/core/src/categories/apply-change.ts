// One change to a Harness's category record, pure: every change kind runs here.
import {
  categoryNameProblem,
  sameCategoryName,
  trimCategoryName,
} from "./category-name";
import type { CategoryRecord } from "./category-section";

export type CategoryChange = { kind: "add"; name: string };

export type AppliedChange =
  | { ok: true; record: CategoryRecord; added?: string }
  | { ok: false; error: "name-exists"; existing: string }
  | { ok: false; error: "name-invalid" };

export const applyChange = (
  record: CategoryRecord,
  change: CategoryChange,
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
  }
};
