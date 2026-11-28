import { isMap, isScalar, isSeq, parseDocument, type YAMLMap } from "yaml";
import { isValidSkillSlug } from "./package-ref";

export type ManifestSelection =
  | { kind: "absent" }
  | { kind: "selection"; skills: string[] }
  | { kind: "legacy-entry" }
  | { kind: "not-recognised" };

const NOT_RECOGNISED = { kind: "not-recognised" } as const;

const rootRefFor = (ownerRepo: string) =>
  new RegExp(`^(?:[^/]+/)?${escapeForPattern(ownerRepo)}(?:#.*)?$`);

const subpathRefFor = (ownerRepo: string) =>
  new RegExp(
    `^(?:github\\.com/)?${escapeForPattern(ownerRepo)}/[^#]+(?:#.*)?$`,
  );

export function readHarnessSelection(
  raw: string | null,
  ownerRepo: string,
): ManifestSelection {
  if (raw === null) {
    return { kind: "absent" };
  }
  const found = harnessEntries(raw, ownerRepo);
  if (found === null) {
    return NOT_RECOGNISED;
  }
  const [entry, ...others] = found.roots;
  if (entry === undefined) {
    return { kind: "absent" };
  }
  if (others.length > 0) {
    return NOT_RECOGNISED;
  }
  if (found.hasSubpath) {
    return { kind: "legacy-entry" };
  }
  return skillsOf(entry);
}

export function writeHarnessSelection(
  raw: string,
  ownerRepo: string,
  skills: readonly string[],
): string | null {
  if (skills.length === 0 || !skills.every(isValidSkillSlug)) {
    return null;
  }
  const doc = parseDocumentOrNull(raw);
  const found = doc === null ? null : harnessEntries(raw, ownerRepo, doc);
  const [entry, ...others] = found?.roots ?? [];
  if (doc === null || entry === undefined || others.length > 0) {
    return null;
  }
  if (skillsOf(entry).kind !== "selection") {
    return null;
  }
  entry.set("skills", doc.createNode([...skills].sort()));
  return doc.toString();
}

function harnessEntries(
  raw: string,
  ownerRepo: string,
  parsed?: ReturnType<typeof parseDocument>,
): { roots: YAMLMap[]; hasSubpath: boolean } | null {
  const doc = parsed ?? parseDocumentOrNull(raw);
  if (doc === null) {
    return null;
  }
  const apm = doc.getIn(["dependencies", "apm"], true);
  if (apm === undefined || apm === null) {
    return { roots: [], hasSubpath: false };
  }
  if (!isSeq(apm)) {
    return null;
  }
  const rootRef = rootRefFor(ownerRepo);
  const subpathRef = subpathRefFor(ownerRepo);
  const roots: YAMLMap[] = [];
  let hasSubpath = false;
  for (const item of apm.items) {
    const ref = refOf(item);
    if (ref === null) {
      continue;
    }
    if (subpathRef.test(ref)) {
      hasSubpath = true;
    } else if (rootRef.test(ref)) {
      if (!isMap(item)) {
        return null;
      }
      roots.push(item);
    }
  }
  return { roots, hasSubpath };
}

function refOf(item: unknown): string | null {
  if (!isMap(item)) {
    return plainString(item);
  }
  const git = item.get("git");
  return typeof git === "string" ? git : null;
}

function skillsOf(entry: YAMLMap): ManifestSelection {
  const skills = entry.get("skills", true);
  if (!isSeq(skills)) {
    return NOT_RECOGNISED;
  }
  const names = skills.items.map(plainString);
  return names.every(
    (name): name is string => name !== null && isValidSkillSlug(name),
  )
    ? { kind: "selection", skills: names }
    : NOT_RECOGNISED;
}

function plainString(node: unknown): string | null {
  if (typeof node === "string") {
    return node;
  }
  return isScalar(node) && typeof node.value === "string" ? node.value : null;
}

function parseDocumentOrNull(
  raw: string,
): ReturnType<typeof parseDocument> | null {
  try {
    const doc = parseDocument(raw);
    return doc.errors.length > 0 ? null : doc;
  } catch {
    return null;
  }
}

function escapeForPattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
