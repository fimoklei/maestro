import type { HarnessPrimitiveType, ImportMode } from "@maestro/core";
import { sameCategoryName } from "@maestro/core/category-name";
import { useState } from "react";
import type { NoticeContent } from "../ui/notice";
import {
  CATEGORY_FIELD_HINT,
  categoryNotSetAfterImport,
  TAKEN_FROM_FILE,
} from "./categories-copy";
import type { CategoryFieldState } from "./category-field";
import { useAssignCategory, useCategories } from "./use-categories";

type Landed = { name: string; mode: ImportMode };

/**
 * The Category field of an import dialog. A new item starts on the category
 * its file names, when one matches; an item it replaces keeps its own. The
 * category is saved once the import has landed, and only when it changes.
 */
export function useCategoryChoice({
  type,
  name,
  mode,
  fromFile,
  open,
}: {
  type: HarnessPrimitiveType;
  /** The item's name as the dialog would import it. */
  name: string;
  mode: ImportMode;
  /** `metadata.category` in the imported file; null where it names none. */
  fromFile: string | null;
  /** The dialog is open: only then are the categories read. */
  open: boolean;
}) {
  const categories = useCategories({ enabled: open });
  const assign = useAssignCategory();
  // Null until the reader picks; a pick outlasts a new check.
  const [picked, setPicked] = useState<{ category: string | null } | null>(
    null,
  );
  const [failure, setFailure] = useState<NoticeContent | null>(null);
  const list = categories.data;
  const replacing = mode === "update";
  const own = replacing
    ? (list?.assignments.find(
        (each) => each.type === type && each.name === name,
      )?.category ?? null)
    : null;
  const named = replacing ? null : fromFile;
  const matched =
    named === null
      ? null
      : (list?.categories.find((each) => sameCategoryName(each.name, named))
          ?.name ?? null);
  const taken = picked === null && matched !== null;
  const value = picked !== null ? picked.category : replacing ? own : matched;

  const field: CategoryFieldState = {
    value,
    hint: taken ? TAKEN_FROM_FILE[type] : CATEGORY_FIELD_HINT,
    suggested: picked === null && matched === null ? named : null,
    onPick: (category) => setPicked({ category }),
  };

  return {
    field,
    /** Why the last import landed without its category; null once dismissed. */
    failure,
    dismissFailure: () => setFailure(null),
    /** Forgets the pick, as the dialog closes. */
    reset: () => setPicked(null),
    /** After the import landed: saves the category the field holds, if it changed. */
    save: (landed: Landed) => {
      if (value === own) return;
      setFailure(null);
      assign.mutate(
        { items: [{ type, name: landed.name }], category: value },
        {
          onError: () =>
            setFailure(
              categoryNotSetAfterImport(type, landed.name, landed.mode),
            ),
        },
      );
    },
  };
}
