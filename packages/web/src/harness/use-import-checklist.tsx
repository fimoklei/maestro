import type { HarnessPrimitiveType } from "@maestro/core";
import { sameCategoryName } from "@maestro/core/category-name";
import { type ReactNode, useRef, useState } from "react";
import {
  CATEGORY_FIELD,
  CATEGORY_NOT_ADDED,
  CATEGORY_NOT_SET,
  categoryNotSetAfterImport,
  setCategoryFor,
} from "../categories/categories-copy";
import type { CategoryFieldState } from "../categories/category-field";
import { CategoryPicker } from "../categories/category-picker";
import { RowCategoryControl } from "../categories/row-category-control";
import {
  useAssignCategory,
  useCategoriesWhile,
} from "../categories/use-categories";
import {
  type HeldCategoryAdd,
  useHeldCategoryAdd,
} from "../categories/use-held-category-add";
import { toggleStaged } from "../ui/bulk-selection";
import type { GroupedListGroup } from "../ui/grouped-list";
import { Notice } from "../ui/notice";
import type { ReportGroup } from "../ui/report";
import {
  type ImportRow,
  importChecklistGroups,
} from "./import-checklist-groups";

/** A row the import landed: its key in the checklist and the name it landed under. */
type LandedRow = { key: string; name: string };

export type ImportChecklist<Refusal> = {
  /** Null until a source lists rows. */
  rows: readonly ImportRow<Refusal>[] | null;
  checked: ReadonlySet<string>;
  toggle: (key: string) => void;
  /** The checked rows, each marked where it replaces a held item. */
  picked: readonly { key: string; replace: boolean }[];
  /** The rows as the checklist groups them: new, Already in the Harness, refused. */
  groups: (
    refusalSentence: (refusal: Refusal) => ReactNode,
    isRunning: boolean,
  ) => GroupedListGroup[];
  /** The category add a row's menu runs; a submit waits for it. */
  categoryAdd: HeldCategoryAdd;
  /**
   * After the import: saves each landed row's category that changed, one
   * write per category, and answers the Report lines for those not saved.
   */
  saveCategories: (landed: readonly LandedRow[]) => Promise<ReportGroup[]>;
};

// What the reader changed for one source: a new row starts checked and a held
// one unchecked, so each set holds only the flips. A row's category is held
// only once picked; `menu` is the row whose category menu is open.
type Marks<Source> = {
  source: Source;
  unchecked: ReadonlySet<string>;
  replacing: ReadonlySet<string>;
  categories: ReadonlyMap<string, string | null>;
  menu: string | null;
};

const blank = <Source,>(source: Source): Marks<Source> => ({
  source,
  unchecked: new Set(),
  replacing: new Set(),
  categories: new Map(),
  menu: null,
});

/**
 * The checks and each row's Category of Import skills and Import prompts.
 * Another source clears them. `type` names whose categories the rows set;
 * null leaves the rows without a Category.
 */
export function useImportChecklist<Source, Refusal>(
  source: Source,
  rows: readonly ImportRow<Refusal>[] | null,
  type: HarnessPrimitiveType | null,
): ImportChecklist<Refusal> & {
  /**
   * One row's Category as a dialog field shows it, for a row set outside the
   * list; null where the rows take no Category or no such row is listed.
   */
  categoryField: (key: string) => CategoryFieldState | null;
} {
  const [stored, setStored] = useState(() => blank(source));
  const marks = Object.is(stored.source, source) ? stored : blank(source);
  const update = (change: (base: Marks<Source>) => Marks<Source>) =>
    setStored((current) =>
      change(Object.is(current.source, source) ? current : blank(source)),
    );
  const pick = (key: string, category: string | null) =>
    update((base) => ({
      ...base,
      categories: new Map(base.categories).set(key, category),
      menu: null,
    }));

  const list = useCategoriesWhile(type !== null).data;
  const assign = useAssignCategory();
  // The row whose menu started the add: a press may close the menu first.
  const addingFor = useRef<string | null>(null);
  const categoryAdd = useHeldCategoryAdd((category) => {
    if (addingFor.current !== null) pick(addingFor.current, category);
  });
  const opener = useRef<HTMLButtonElement>(null);

  const ownCategory = (name: string): string | null =>
    list?.assignments.find((each) => each.type === type && each.name === name)
      ?.category ?? null;
  // A new row starts on its file's category where the list holds it; a held
  // row on the held item's own.
  const startOf = (row: ImportRow<Refusal>) => {
    if (row.held) return { value: ownCategory(row.name), suggested: null };
    const named = row.fileCategory;
    const matched =
      named === null
        ? null
        : (list?.categories.find((each) => sameCategoryName(each.name, named))
            ?.name ?? null);
    return { value: matched, suggested: matched === null ? named : null };
  };
  const categoryOf = (row: ImportRow<Refusal>) => {
    const start = startOf(row);
    return marks.categories.has(row.key)
      ? { value: marks.categories.get(row.key) ?? null, suggested: null }
      : start;
  };

  const isChecked = (row: ImportRow<Refusal>) =>
    row.refusal === null &&
    (row.held ? marks.replacing.has(row.key) : !marks.unchecked.has(row.key));
  const picked = (rows ?? [])
    .filter(isChecked)
    .map(({ key, held }) => ({ key, replace: held }));

  const closeMenu = (refocus: boolean) => {
    update((base) => ({ ...base, menu: null }));
    if (refocus) opener.current?.focus();
  };

  // The add as one row's menu runs it: the added category lands on that row.
  const addFor = (key: string): HeldCategoryAdd => ({
    ...categoryAdd,
    run: (typed) => {
      addingFor.current = key;
      return categoryAdd.run(typed);
    },
  });

  const categoryParts = (row: ImportRow<Refusal>, isRunning: boolean) => {
    if (type === null || row.refusal !== null) return {};
    const { value, suggested } = categoryOf(row);
    const open = marks.menu === row.key;
    const add = addFor(row.key);
    // In the flow under the row: the list clips what floats out of it.
    const choice = open ? (
      <CategoryPicker
        label={setCategoryFor(row.name)}
        current={value}
        initialQuery={suggested ?? undefined}
        failure={null}
        add={add}
        onPick={(category) => {
          pick(row.key, category);
          opener.current?.focus();
        }}
        onClose={(via) => closeMenu(via !== "press")}
      />
    ) : categoryAdd.failed && addingFor.current === row.key ? (
      // An add refused after a press closed the menu.
      <Notice
        trigger="user-action"
        notice={{ level: "error", ...CATEGORY_NOT_ADDED }}
      />
    ) : undefined;
    return {
      control: (
        <RowCategoryControl
          name={row.name}
          value={value}
          open={open}
          disabled={isRunning}
          buttonRef={open ? opener : undefined}
          onToggle={() =>
            update((base) => ({
              ...base,
              menu: base.menu === row.key ? null : row.key,
            }))
          }
        />
      ),
      ...(choice === undefined ? {} : { choice }),
    };
  };

  return {
    rows,
    checked: new Set(picked.map(({ key }) => key)),
    toggle: (key) => {
      const row = rows?.find((candidate) => candidate.key === key);
      if (row === undefined || row.refusal !== null) return;
      update((base) =>
        row.held
          ? { ...base, replacing: toggleStaged(base.replacing, key) }
          : { ...base, unchecked: toggleStaged(base.unchecked, key) },
      );
    },
    picked,
    groups: (refusalSentence, isRunning) =>
      importChecklistGroups(rows ?? [], refusalSentence, (row) =>
        categoryParts(row, isRunning),
      ),
    categoryField: (key) => {
      const row = rows?.find((candidate) => candidate.key === key);
      if (type === null || row === undefined) return null;
      return {
        ...categoryOf(row),
        hint: CATEGORY_FIELD.hint,
        onChange: (category) => pick(key, category),
        add: addFor(key),
      };
    },
    categoryAdd,
    saveCategories: async (landed) => {
      if (type === null) return [];
      // Keyed by category; null takes the items out of every category.
      const writes = new Map<string | null, string[]>();
      for (const { key, name } of landed) {
        const row = rows?.find((candidate) => candidate.key === key);
        if (row === undefined) continue;
        const { value } = categoryOf(row);
        if (value === (row.held ? ownCategory(row.name) : null)) continue;
        writes.set(value, [...(writes.get(value) ?? []), name]);
      }
      const unsaved: string[] = [];
      // One after another: each write answers the whole list.
      for (const [category, names] of writes) {
        try {
          await assign.mutateAsync({
            items: names.map((name) => ({ type, name })),
            category,
          });
        } catch {
          unsaved.push(...names);
        }
      }
      if (unsaved.length === 0) return [];
      return [
        {
          tone: "failed",
          label: CATEGORY_NOT_SET,
          rows: unsaved.map((name) => ({
            name,
            detail: categoryNotSetAfterImport(type, name, "add").message,
          })),
        },
      ];
    },
  };
}
