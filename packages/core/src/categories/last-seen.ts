import { primitiveKey } from "../harness/harness-primitive";
import { withoutStale } from "./apply-change";
import { sameCategoryName } from "./category-name";
import type { CategoryRecord } from "./category-section";
import type { HeldItems } from "./held-items";

const contentOf = ({ names, assignments }: CategoryRecord) => ({
  names: [...names].sort(),
  assignments: assignments
    .map((each) => `${primitiveKey(each)}=${each.category}`)
    .sort(),
});

export const sameCategories = (a: CategoryRecord, b: CategoryRecord) =>
  JSON.stringify(contentOf(a)) === JSON.stringify(contentOf(b));

export const ownEqualsHarness = (
  own: CategoryRecord,
  harness: CategoryRecord,
  held: HeldItems | null,
) => sameCategories(withoutStale(own, held), withoutStale(harness, held));

export const newSinceSeen = (
  harness: CategoryRecord,
  seen: CategoryRecord | null,
): string[] =>
  seen === null
    ? []
    : harness.names.filter(
        (name) => !seen.names.some((each) => sameCategoryName(each, name)),
      );
