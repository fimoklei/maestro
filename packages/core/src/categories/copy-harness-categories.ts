import { type PrimitiveRef, primitiveKey } from "../harness/harness-primitive";
import { withoutStale } from "./apply-change";
import { compareCategoryNames, sameCategoryName } from "./category-name";
import {
  type CategoryRecord,
  type ItemCount,
  itemCount,
} from "./category-section";
import type { HeldItems } from "./held-items";

export type CopyMode = "add" | "replace";

export const COPY_MODES = [
  "add",
  "replace",
] as const satisfies readonly CopyMode[];

export type CopyFacts = {
  added: string[];
  deleted: string[];
  unchanged: string[];
  respelled: { name: string; was: string }[];
  moved: ItemCount;
  uncategorised: ItemCount;
};

export type CopiedCategories = { record: CategoryRecord; facts: CopyFacts };

const sorted = (names: readonly string[]) =>
  [...names].sort(compareCategoryNames);

const findName = (names: readonly string[], name: string) =>
  names.find((each) => sameCategoryName(each, name));

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
  return { moved: itemCount(moved), uncategorised: itemCount(uncategorised) };
};

export const copyHarnessCategories = ({
  own,
  harness,
  mode,
  held,
}: {
  own: CategoryRecord;
  harness: CategoryRecord;
  mode: CopyMode;
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
