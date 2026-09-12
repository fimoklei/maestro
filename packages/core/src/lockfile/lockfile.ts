// The single source of truth for apm.lock.yaml, so no two readers can disagree
// on whether one is valid. A malformed lockfile is a parse failure, never an
// empty stand-in for "I could not read this" (#58) — but that verdict is on the
// whole file, never on one entry it happens to hold (#357).
import { basename } from "node:path";
import { parse } from "yaml";
import { z } from "zod";

// Every optional field is one a pre-0.20.0 entry omits, or one only the remove
// path reads: an entry lacking it stays parseable and is refused further along
// rather than failing the whole file. Unknown keys (content_hash) are ignored.
const lockfileEntrySchema = z.object({
  resolved_ref: z.string(),
  // Absent on a root-package row, which names the whole repository rather than
  // one primitive inside it (fixture apm.lock.spike-941-step3d-phantom.yaml).
  // Every other row must carry one, enforced below.
  virtual_path: z.string().optional(),
  // Bounded here, where apm output is first read: this value is the one
  // apm-derived field an HTTP response carries (ADR-0018, security.md).
  package_type: z.string().regex(/^[a-z0-9_-]{1,40}$/i),
  host: z.string().optional(),
  repo_url: z.string().optional(),
  deployed_files: z.array(z.string()).optional(),
  deployed_file_hashes: z.record(z.string(), z.string()).optional(),
  // Only a root-package row carries one: the selection apm persisted. Parsed so
  // the shape is known, never read as what is deployed (#941, ADR-0031).
  skill_subset: z.array(z.string()).optional(),
});

const lockfileSchema = z.object({
  dependencies: z.array(z.unknown()),
});

// The only field worth salvaging from an entry that failed the shape: it names
// the entry for the reader (#357). Absent or non-string means we cannot name it.
const namedEntrySchema = z.object({ virtual_path: z.string() });

export type LockfileEntry = z.infer<typeof lockfileEntrySchema>;

// An entry the file holds but we cannot interpret. Separate from a whole-file
// failure: the siblings around it are still trustworthy (#357).
export type UnreadableEntry = { virtualPath: string | null };

type LockfileParseResult =
  | { ok: true; entries: LockfileEntry[]; unreadable: UnreadableEntry[] }
  | { ok: false };

// Judges the text only — whether the file exists is the caller's I/O concern.
export function parseLockfile(raw: string): LockfileParseResult {
  let data: unknown;
  try {
    data = parse(raw);
  } catch {
    return { ok: false };
  }

  const parsed = lockfileSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false };
  }

  const entries: LockfileEntry[] = [];
  const unreadable: UnreadableEntry[] = [];
  for (const candidate of parsed.data.dependencies) {
    const entry = lockfileEntrySchema.safeParse(candidate);
    // A row that is not a root package and names no path identifies nothing:
    // reading it as a skill would invent the empty name (#357).
    if (entry.success && namesItself(entry.data)) {
      entries.push(entry.data);
      continue;
    }
    const named = namedEntrySchema.safeParse(candidate);
    unreadable.push({
      virtualPath: named.success ? named.data.virtual_path : null,
    });
  }
  return { ok: true, entries, unreadable };
}

function namesItself(entry: LockfileEntry): boolean {
  return (
    entry.virtual_path !== undefined ||
    classifyPackageType(entry.package_type) === "package"
  );
}

// The write path stays fail-closed: skipping an entry is safe for a reader, but
// a guard that cannot read an entry must not call that skill "not deployed"
// (#58). An unnamed entry covers every name — we cannot rule it out.
export function unreadableCovers(
  unreadable: readonly UnreadableEntry[],
  name: string,
): boolean {
  return unreadable.some(
    (entry) =>
      entry.virtualPath === null || basename(entry.virtualPath) === name,
  );
}

// What apm recorded, in the terms the cockpit reports: a manageable skill, a
// root package holding many of them, a package it materialized but Maestro
// cannot manage as one, apm's own "this attempt placed nothing" verdict, or a
// different primitive altogether (#358, ADR-0031).
export type PackageClass =
  | "skill"
  | "package"
  | "unsupported"
  | "invalid"
  | "other";

// What apm 0.26.0 writes for a skill that also carries an apm.yml or a
// plugin.json (docs/apm-behavior.md § Lockfile).
const UNSUPPORTED_TYPES = new Set(["hybrid", "marketplace_plugin"]);

export function classifyPackageType(packageType: string): PackageClass {
  if (packageType === "claude_skill") {
    return "skill";
  }
  // One dependency on the whole Harness, with its own selection of skills
  // (docs/research/929-native-model-spike.md).
  if (packageType === "apm_package") {
    return "package";
  }
  if (packageType === "invalid") {
    return "invalid";
  }
  return UNSUPPORTED_TYPES.has(packageType) ? "unsupported" : "other";
}

// A skill carries its name; every other reading carries the type to report.
export type PackageReading =
  | { kind: "skill"; name: string }
  // A root package names no one skill; its skills come from its recorded files.
  | { kind: "package" }
  | {
      kind: Exclude<PackageClass, "skill" | "package">;
      packageType: string;
    };

// The identity rule, written once so no layer re-implements it.
export function readPackage(entry: LockfileEntry): PackageReading {
  const kind = classifyPackageType(entry.package_type);
  if (kind === "skill") {
    return { kind, name: basename(entry.virtual_path ?? "") };
  }
  return kind === "package"
    ? { kind }
    : { kind, packageType: entry.package_type };
}

export function claudeSkillName(entry: LockfileEntry): string | null {
  const reading = readPackage(entry);
  return reading.kind === "skill" ? reading.name : null;
}
