// The one owner of `.maestro/categories.yml`, the Harness categories: read
// from any ref, written as file text. Nothing else parses or writes the file.
import { Document, parseDocument } from "yaml";
import { z } from "zod";
import {
  HARNESS_PRIMITIVE_TYPES,
  type HarnessPrimitiveType,
  primitiveKey,
} from "../harness/harness-primitive";
import type { FileAtRef } from "../harness/read-harness-state";
import {
  categoryNameProblem,
  sameCategoryName,
  trimCategoryName,
} from "./category-name";
import type { CategoryRecord } from "./category-section";

export const HARNESS_CATEGORIES_PATH = ".maestro/categories.yml";
export const HARNESS_CATEGORIES_MAX_BYTES = 256 * 1024;
const HARNESS_CATEGORIES_MAX_COUNT = 200;

/** `skipped` counts the entries left out for an error in them. */
export type HarnessCategoriesFile =
  | { kind: "absent" }
  | { kind: "valid"; record: CategoryRecord; skipped: number }
  | { kind: "faulty" };

const FAULTY = { kind: "faulty" } as const;

const fileSchema = z.object({
  version: z.literal(1),
  categories: z.array(z.unknown()).max(HARNESS_CATEGORIES_MAX_COUNT),
  assignments: z.array(z.unknown()),
});

const assignmentSchema = z.object({
  type: z.string(),
  name: z.string().min(1),
  category: z.string(),
});

const isPrimitiveType = (type: string): type is HarnessPrimitiveType =>
  (HARNESS_PRIMITIVE_TYPES as readonly string[]).includes(type);

const byteLength = (text: string): number =>
  new TextEncoder().encode(text).byteLength;

// Core schema and no custom tags: a tag the schema lacks is a warning, and any
// warning fails the file.
const parseYaml = (text: string): { ok: true; value: unknown } | null => {
  try {
    const doc = parseDocument(text, { schema: "core", uniqueKeys: true });
    if (doc.errors.length > 0 || doc.warnings.length > 0) return null;
    return { ok: true, value: doc.toJS() };
  } catch {
    return null;
  }
};

const namesOf = (raw: readonly unknown[]) => {
  const names: string[] = [];
  let skipped = 0;
  for (const entry of raw) {
    const name = typeof entry === "string" ? trimCategoryName(entry) : null;
    if (
      name === null ||
      categoryNameProblem(name) !== null ||
      names.some((each) => sameCategoryName(each, name))
    ) {
      skipped += 1;
      continue;
    }
    names.push(name);
  }
  return { names, skipped };
};

const assignmentsOf = (raw: readonly unknown[], names: readonly string[]) => {
  const assignments: CategoryRecord["assignments"] = [];
  const seen = new Set<string>();
  let skipped = 0;
  for (const entry of raw) {
    const parsed = assignmentSchema.safeParse(entry);
    if (!parsed.success) {
      skipped += 1;
      continue;
    }
    const { type, name } = parsed.data;
    // A type a later Maestro knows is no error in this file.
    if (!isPrimitiveType(type)) continue;
    const category = names.find((each) =>
      sameCategoryName(each, trimCategoryName(parsed.data.category)),
    );
    const key = primitiveKey({ type, name });
    if (category === undefined || seen.has(key)) {
      skipped += 1;
      continue;
    }
    seen.add(key);
    assignments.push({ type, name, category });
  }
  return { assignments, skipped };
};

/**
 * The file text for a list within the file's limits; the serializer quotes
 * each name YAML would read as another value.
 * @internal Only tests write it until the categories pull request (#1910) does.
 */
export const writeHarnessCategoriesFile = (record: CategoryRecord): string =>
  new Document({
    version: 1,
    categories: record.names,
    assignments: record.assignments.map(({ type, name, category }) => ({
      type,
      name,
      category,
    })),
  }).toString({ lineWidth: 0 });

export const readHarnessCategoriesFile = (
  read: FileAtRef,
): HarnessCategoriesFile => {
  if (read.kind === "absent") return { kind: "absent" };
  if (read.kind === "too-large") return FAULTY;
  if (byteLength(read.text) > HARNESS_CATEGORIES_MAX_BYTES) return FAULTY;
  const yaml = parseYaml(read.text);
  if (yaml === null) return FAULTY;
  const file = fileSchema.safeParse(yaml.value);
  if (!file.success) return FAULTY;
  const names = namesOf(file.data.categories);
  const assignments = assignmentsOf(file.data.assignments, names.names);
  return {
    kind: "valid",
    record: { names: names.names, assignments: assignments.assignments },
    skipped: names.skipped + assignments.skipped,
  };
};
