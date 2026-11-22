import { isMap, isScalar, isSeq, parseDocument, type YAMLMap } from "yaml";
import { isValidSkillSlug } from "./package-ref";

export type ManifestSelection =
  | { kind: "absent" }
  | { kind: "selection"; skills: string[] }
  | { kind: "not-recognised" };

const NOT_RECOGNISED = { kind: "not-recognised" } as const;

const rootRefFor = (ownerRepo: string) =>
  new RegExp(`^(?:[^/]+/)?${escapeForPattern(ownerRepo)}(?:#.*)?$`);

export function readHarnessSelection(
  raw: string | null,
  ownerRepo: string,
): ManifestSelection {
  if (raw === null) {
    return { kind: "absent" };
  }
  const entries = harnessEntries(raw, ownerRepo);
  if (entries === null) {
    return NOT_RECOGNISED;
  }
  const [entry, ...others] = entries;
  if (entry === undefined) {
    return { kind: "absent" };
  }
  if (others.length > 0) {
    return NOT_RECOGNISED;
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
  const entries = doc === null ? null : harnessEntries(raw, ownerRepo, doc);
  const [entry, ...others] = entries ?? [];
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
): YAMLMap[] | null {
  const doc = parsed ?? parseDocumentOrNull(raw);
  if (doc === null) {
    return null;
  }
  const apm = doc.getIn(["dependencies", "apm"], true);
  if (apm === undefined || apm === null) {
    return [];
  }
  if (!isSeq(apm)) {
    return null;
  }
  const rootRef = rootRefFor(ownerRepo);
  const matches: YAMLMap[] = [];
  for (const item of apm.items) {
    if (isMap(item)) {
      const git = item.get("git");
      if (typeof git === "string" && rootRef.test(git)) {
        matches.push(item);
      }
      continue;
    }
    const ref = plainString(item);
    if (ref !== null && rootRef.test(ref)) {
      return null;
    }
  }
  return matches;
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
