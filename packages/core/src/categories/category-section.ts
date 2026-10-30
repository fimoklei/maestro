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

const entrySchema = z.object({
  // `host/ownerRepo`; null for a Harness with no GitHub origin.
  origin: z.string().nullable(),
  root: z.string(),
  names: z.array(z.string()),
  assignments: z.array(assignmentSchema),
});

const sectionSchema = z.array(entrySchema);

type CategorySection = z.infer<typeof sectionSchema>;

/** One Harness's own list: its category names and what carries each. */
export type CategoryRecord = Pick<
  z.infer<typeof entrySchema>,
  "names" | "assignments"
>;

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

/** The section with this Harness's record saved, under its current origin and root. */
export const withRecord = (
  section: CategorySection,
  harness: HarnessKey,
  record: CategoryRecord,
): CategorySection => {
  const entry = {
    origin: originKey(harness.origin),
    root: harness.root,
    ...record,
  };
  const index = entryIndex(section, harness);
  return index === -1
    ? [...section, entry]
    : section.map((each, at) => (at === index ? entry : each));
};
