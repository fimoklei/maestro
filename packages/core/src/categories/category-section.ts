// The `categories` section of Maestro's config: its own schema, read apart from
// the rest so a broken section fails only the category reads and writes.
import { z } from "zod";
import type { GitOrigin } from "../deploy/git-origin";
import { HARNESS_PRIMITIVE_TYPES } from "../harness/harness-primitive";

const assignmentSchema = z.object({
  type: z.enum(HARNESS_PRIMITIVE_TYPES),
  name: z.string(),
  category: z.string(),
});

const recordSchema = z.object({
  names: z.array(z.string()),
  assignments: z.array(assignmentSchema),
});

const entrySchema = recordSchema.extend({
  // `host/ownerRepo`; null for a Harness with no GitHub origin.
  origin: z.string().nullable(),
  root: z.string(),
  // The Harness categories the operator last saw; absent: never seen.
  seen: recordSchema.optional(),
});

const sectionSchema = z.array(entrySchema);

type CategorySection = z.infer<typeof sectionSchema>;

/** One Harness's own list: its category names and what carries each. */
export type CategoryRecord = z.infer<typeof recordSchema>;

/** Where the connected Harness lives, and the repository it names. */
export type HarnessKey = { root: string; origin: GitOrigin | null };

const originKey = (origin: GitOrigin | null): string | null =>
  origin === null ? null : `${origin.host}/${origin.ownerRepo}`;

/** The section as saved; null when it does not parse. Absent is empty. */
export const readCategorySection = (raw: unknown): CategorySection | null => {
  if (raw === undefined) return [];
  const parsed = sectionSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
};

// The origin first, so a second clone of one repository finds its list; then
// the root, so a repository renamed on GitHub keeps it.
const entryIndex = (section: CategorySection, harness: HarnessKey): number => {
  const origin = originKey(harness.origin);
  const byOrigin =
    origin === null
      ? -1
      : section.findIndex((entry) => entry.origin === origin);
  return byOrigin === -1
    ? section.findIndex((entry) => entry.root === harness.root)
    : byOrigin;
};

export const recordOf = (
  section: CategorySection,
  harness: HarnessKey,
): CategoryRecord => {
  const entry = section[entryIndex(section, harness)];
  return entry === undefined
    ? { names: [], assignments: [] }
    : { names: entry.names, assignments: entry.assignments };
};

/** The Harness categories the operator last saw; null: never seen. */
export const seenOf = (
  section: CategorySection,
  harness: HarnessKey,
): CategoryRecord | null => section[entryIndex(section, harness)]?.seen ?? null;

// Saved under the Harness's current origin and root.
const withEntry = (
  section: CategorySection,
  harness: HarnessKey,
  change: (entry: CategorySection[number]) => CategorySection[number],
): CategorySection => {
  const index = entryIndex(section, harness);
  const entry = change({
    names: [],
    assignments: [],
    ...section[index],
    origin: originKey(harness.origin),
    root: harness.root,
  });
  return index === -1
    ? [...section, entry]
    : section.map((each, at) => (at === index ? entry : each));
};

/** The section with this Harness's own list saved; last seen stays. */
export const withRecord = (
  section: CategorySection,
  harness: HarnessKey,
  record: CategoryRecord,
): CategorySection =>
  withEntry(section, harness, (entry) => ({ ...entry, ...record }));

/** The section with the Harness categories recorded as seen; the own list stays. */
export const withSeen = (
  section: CategorySection,
  harness: HarnessKey,
  seen: CategoryRecord,
): CategorySection =>
  withEntry(section, harness, (entry) => ({ ...entry, seen }));
