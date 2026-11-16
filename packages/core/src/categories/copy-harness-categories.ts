// The one computation behind a copy of the Harness categories: the copy
// dialog's preview and the write both run it, so they cannot differ.
import { type PrimitiveRef, primitiveKey } from "../harness/harness-primitive";
import { withoutStale } from "./apply-change";
import { compareCategoryNames, sameCategoryName } from "./category-name";
import type { CategoryRecord } from "./category-section";
import type { HeldItems } from "./held-items";

/** `add` keeps everything the operator has; `replace` makes the list the Harness list. */
export type CopyMode = "add" | "replace";

export const COPY_MODES = [
  "add",
  "replace",
] as const satisfies readonly CopyMode[];

type ItemCount = { skills: number; prompts: number };

/** What a copy does to the operator's categories, each group sorted by name. */
export type CopyFacts = {
  added: string[];
  deleted: string[];
  unchanged: string[];
  /** Names the copy spells as the Harness does, with the operator's spelling. */
  respelled: { name: string; was: string }[];
  /** The operator's items that land in another category. */
  moved: ItemCount;
  /** The operator's items that have no category afterwards. */
  uncategorised: ItemCount;
};

export type CopiedCategories = { record: CategoryRecord; facts: CopyFacts };

const sorted = (names: readonly string[]) =>
  [...names].sort(compareCategoryNames);

const findName = (names: readonly string[], name: string) =>
  names.find((each) => sameCategoryName(each, name));

// The operator's spelling wins; an item that has a category keeps it.
const add = (own: CategoryRecord, harness: CategoryRecord): CategoryRecord => {
  const spelling = new Map(
    harness.names.map((name) => [name, findName(own.names, name) ?? name]),
  );
  const assigned = new Set(own.assignments.map(primitiveKey));
  return {
    names: [
      ...own.names,
      ...harness.names.filter(
        (name) => findName(own.names, name) === undefined,
      ),
    ],
    assignments: [
      ...own.assignments,
      ...harness.assignments.flatMap((each) =>
        assigned.has(primitiveKey(each))
          ? []
          : [
              {
                ...each,
                category: spelling.get(each.category) ?? each.category,
              },
            ],
      ),
    ],
  };
};

const counted = (refs: readonly PrimitiveRef[]): ItemCount => ({
  skills: refs.filter((each) => each.type === "skill").length,
  prompts: refs.filter((each) => each.type === "prompt").length,
});

// Only an item that had a category counts: one that gains a category loses nothing.
const taken = (before: CategoryRecord, after: CategoryRecord) => {
  const landed = new Map(
    after.assignments.map((each) => [primitiveKey(each), each.category]),
  );
  const moved: PrimitiveRef[] = [];
  const uncategorised: PrimitiveRef[] = [];
  for (const each of before.assignments) {
    const category = landed.get(primitiveKey(each));
    if (category === undefined) uncategorised.push(each);
    else if (!sameCategoryName(category, each.category)) moved.push(each);
  }
  return { moved: counted(moved), uncategorised: counted(uncategorised) };
};

/** The operator's list after a copy of the Harness list, and what the copy changes. */
export const copyHarnessCategories = ({
  own,
  harness,
  mode,
  held,
}: {
  own: CategoryRecord;
  harness: CategoryRecord;
  mode: CopyMode;
  /** Null: Inventory could not be read, so no assignment is dropped. */
  held: HeldItems | null;
}): CopiedCategories => {
  const kept = withoutStale(own, held);
  const offered = withoutStale(harness, held);
  const record = mode === "add" ? add(kept, offered) : offered;
  return {
    record,
    facts: {
      added: sorted(
        record.names.filter((name) => findName(own.names, name) === undefined),
      ),
      deleted: sorted(
        own.names.filter((name) => findName(record.names, name) === undefined),
      ),
      unchanged: sorted(
        record.names.filter((name) => findName(own.names, name) !== undefined),
      ),
      respelled: sorted(record.names).flatMap((name) => {
        const was = findName(own.names, name);
        return was === undefined || was === name ? [] : [{ name, was }];
      }),
      ...taken(kept, record),
    },
  };
};
