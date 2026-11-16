// What the operator last saw of the Harness categories, against what the
// latest release holds now.
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

/** The same names, spelling included, and the same assignments; order aside. */
export const sameCategories = (a: CategoryRecord, b: CategoryRecord) =>
  JSON.stringify(contentOf(a)) === JSON.stringify(contentOf(b));

/** Equal for the items Inventory holds: a list the operator already has counts as seen. */
export const ownEqualsHarness = (
  own: CategoryRecord,
  harness: CategoryRecord,
  held: HeldItems | null,
) => sameCategories(withoutStale(own, held), withoutStale(harness, held));

/** The Harness category names absent from last seen; none when never seen. */
export const newSinceSeen = (
  harness: CategoryRecord,
  seen: CategoryRecord | null,
): string[] =>
  seen === null
    ? []
    : harness.names.filter(
        (name) => !seen.names.some((each) => sameCategoryName(each, name)),
      );
