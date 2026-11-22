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

export const HARNESS_CATEGORIES_MAX_BYTES = 256 * 1024;
const HARNESS_CATEGORIES_MAX_COUNT = 200;

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
  HARNESS_PRIMITIVE_TYPES.some((each) => each === type);

const byteLength = (text: string): number =>
  new TextEncoder().encode(text).byteLength;

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

export const exceedsHarnessCategoriesLimits = (record: CategoryRecord) =>
  record.names.length > HARNESS_CATEGORIES_MAX_COUNT ||
  byteLength(writeHarnessCategoriesFile(record)) > HARNESS_CATEGORIES_MAX_BYTES;

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
