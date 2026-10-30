import type { HarnessPrimitiveType, ImportMode } from "@maestro/core";
import { sameCategoryName } from "@maestro/core/category-name";
import { useState } from "react";
import type { NoticeContent } from "../ui/notice";
import {
  CATEGORY_FIELD,
  categoryNotSetAfterImport,
  TAKEN_FROM_FILE,
} from "./categories-copy";
import type { CategoryFieldState } from "./category-field";
import { useAssignCategory, useCategoriesWhile } from "./use-categories";
import { useHeldCategoryAdd } from "./use-held-category-add";

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
  const categories = useCategoriesWhile(open);
  const assign = useAssignCategory();
  // Null until the reader picks; a pick outlasts a new check.
  const [picked, setPicked] = useState<{ category: string | null } | null>(
    null,
  );
  const add = useHeldCategoryAdd((category) => setPicked({ category }));
  // An import that landed while its category did not: Close hands it over.
  const [stranded, setStranded] = useState<{
    failure: NoticeContent;
    handOver: () => void;
  } | null>(null);
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
    hint: taken ? TAKEN_FROM_FILE[type] : CATEGORY_FIELD.hint,
    suggested: picked === null && matched === null ? named : null,
    onChange: (category) => setPicked({ category }),
    add,
  };

  return {
    field,
    /** Why the import landed without its category; the dialog keeps only Close. */
    failure: stranded?.failure ?? null,
    saving: assign.isPending,
    /** Forgets the pick and any failure, as the dialog closes. */
    reset: () => {
      setPicked(null);
      setStranded(null);
      add.reset();
      assign.reset();
    },
    /** Close after a failure: the import goes on as if its category had landed. */
    leave: () => stranded?.handOver(),
    /**
     * After the import landed: saves the category the field holds, if it
     * changed, then hands over. A refusal keeps the dialog open on it.
     */
    save: (landed: Landed, handOver: () => void) => {
      if (value === own) {
        handOver();
        return;
      }
      assign.mutate(
        { items: [{ type, name: landed.name }], category: value },
        {
          onSuccess: handOver,
          onError: () =>
            setStranded({
              failure: categoryNotSetAfterImport(
                type,
                landed.name,
                landed.mode,
              ),
              handOver,
            }),
        },
      );
    },
  };
}
