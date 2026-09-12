// The consumer's apm.yml, read and rewritten around one key: the Selection
// under the single dependency on the connected Harness. apm persists the
// Selection there and `--skill` only ever unions with it, so the exact list has
// to be written before every install (ADR-0031, apm-behavior.md § Root package
// and its Selection).
import { isMap, isSeq, parseDocument, type YAMLMap } from "yaml";
import { isValidSkillSlug } from "./package-ref";

// "absent" is the first-Deploy path: apm creates the dependency itself.
// "not-recognised" is every shape Maestro will not edit — two Harness
// dependencies, a bare root string, a missing or non-list `skills:` — and stops
// the write before anything is touched.
export type ManifestSelection =
  | { kind: "absent" }
  | { kind: "selection"; skills: string[] }
  | { kind: "not-recognised" };

const NOT_RECOGNISED = { kind: "not-recognised" } as const;

// A ref string naming the repository root, with or without the host and with
// any tag: `<owner>/<repo>#vX.Y.Z`. A ref carrying a subpath names one skill,
// which is a per-skill dependency and no business of this editor.
const rootRefFor = (ownerRepo: string) =>
  new RegExp(`^(?:[^/]+/)?${escapeForPattern(ownerRepo)}(?:#.*)?$`);

// Null is "no apm.yml at all", which is the same answer as a manifest holding
// no Harness dependency: apm may create one.
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
  if (entries.length === 0) {
    return { kind: "absent" };
  }
  // Picking one would edit a dependency the reader never chose between.
  if (entries.length > 1) {
    return NOT_RECOGNISED;
  }
  return skillsOf(entries[0] as YAMLMap);
}

// The rewritten document, or null where the shape is not this editor's to edit.
// An empty selection is refused too: apm rejects `skills: []` outright, so the
// last removal is a named uninstall instead (apm-behavior.md).
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
  if (doc === null || entries === null || entries.length !== 1) {
    return null;
  }
  const entry = entries[0] as YAMLMap;
  if (skillsOf(entry).kind !== "selection") {
    return null;
  }
  // Sorted, as apm rewrites it, so the list Maestro writes and the list read
  // back after the install are the same order.
  entry.set("skills", doc.createNode([...skills].sort()));
  return doc.toString();
}

// Every `dependencies.apm` item naming the Harness root, as a map this editor
// could edit. Null where the document, the list or a matching item is a shape
// Maestro refuses to touch.
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
    // A bare string naming the Harness root carries no editable `skills:`; one
    // naming a skill subpath is a per-skill dependency, not this dependency.
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
  const value = (node as { value?: unknown } | null)?.value;
  return typeof value === "string" ? value : null;
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
