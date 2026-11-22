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
  origin: z.string().nullable(),
  root: z.string(),
  seen: recordSchema.optional(),
});

const sectionSchema = z.array(entrySchema);

type CategorySection = z.infer<typeof sectionSchema>;

export type CategoryRecord = z.infer<typeof recordSchema>;

export type ItemCount = { skills: number; prompts: number };

export const itemCount = (
  items: readonly { type: CategoryRecord["assignments"][number]["type"] }[],
): ItemCount => ({
  skills: items.filter((item) => item.type === "skill").length,
  prompts: items.filter((item) => item.type === "prompt").length,
});

export type HarnessKey = { root: string; origin: GitOrigin | null };

const originKey = (origin: GitOrigin | null): string | null =>
  origin === null ? null : `${origin.host}/${origin.ownerRepo}`;

export const readCategorySection = (raw: unknown): CategorySection | null => {
  if (raw === undefined) return [];
  const parsed = sectionSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
};

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

export const seenOf = (
  section: CategorySection,
  harness: HarnessKey,
): CategoryRecord | null => section[entryIndex(section, harness)]?.seen ?? null;

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

export const withRecord = (
  section: CategorySection,
  harness: HarnessKey,
  record: CategoryRecord,
): CategorySection =>
  withEntry(section, harness, (entry) => ({ ...entry, ...record }));

export const withSeen = (
  section: CategorySection,
  harness: HarnessKey,
  seen: CategoryRecord,
): CategorySection =>
  withEntry(section, harness, (entry) => ({ ...entry, seen }));
