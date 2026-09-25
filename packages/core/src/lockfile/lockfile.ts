// A malformed lockfile is a parse failure, never an empty stand-in (#58); one
// unreadable entry does not fail the whole file (#357).
import { basename } from "node:path";
import { parse } from "yaml";
import { z } from "zod";

// Optional fields stay optional so an old or partial entry is refused further
// along rather than failing the whole file. Unknown keys are ignored.
const lockfileEntrySchema = z.object({
  resolved_ref: z.string(),
  // Absent only on a root-package row; enforced in parseLockfile.
  virtual_path: z.string().optional(),
  // Bounded here: this field reaches an HTTP response.
  package_type: z.string().regex(/^[a-z0-9_-]{1,40}$/i),
  host: z.string().optional(),
  repo_url: z.string().optional(),
  deployed_files: z.array(z.string()).optional(),
  deployed_file_hashes: z.record(z.string(), z.string()).optional(),
  // Never read as what is deployed: it keeps names apm already dropped.
  skill_subset: z.array(z.string()).optional(),
});

const lockfileSchema = z.object({
  dependencies: z.array(z.unknown()),
});

const namedEntrySchema = z.object({ virtual_path: z.string() });

export type LockfileEntry = z.infer<typeof lockfileEntrySchema>;

export type UnreadableEntry = { virtualPath: string | null };

type LockfileParseResult =
  | { ok: true; entries: LockfileEntry[]; unreadable: UnreadableEntry[] }
  | { ok: false };

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
    // A non-root row with no path would read as a skill with an empty name.
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

// Fail-closed for write guards: an unreadable entry may be this skill, and an
// unnamed one covers every name (#58).
export function unreadableCovers(
  unreadable: readonly UnreadableEntry[],
  name: string,
): boolean {
  return unreadable.some(
    (entry) =>
      entry.virtualPath === null || basename(entry.virtualPath) === name,
  );
}

export type PackageClass =
  | "skill"
  | "package"
  | "unsupported"
  | "invalid"
  | "other";

// apm 0.26.0 writes these for a skill that also carries apm.yml or plugin.json.
const UNSUPPORTED_TYPES = new Set(["hybrid", "marketplace_plugin"]);

export function classifyPackageType(packageType: string): PackageClass {
  if (packageType === "claude_skill") {
    return "skill";
  }
  // One dependency on the whole Harness, with its own selection of skills.
  if (packageType === "apm_package") {
    return "package";
  }
  if (packageType === "invalid") {
    return "invalid";
  }
  return UNSUPPORTED_TYPES.has(packageType) ? "unsupported" : "other";
}

export type PackageReading =
  | { kind: "skill"; name: string }
  // Its skills come from its recorded files.
  | { kind: "package" }
  | {
      kind: Exclude<PackageClass, "skill" | "package">;
      packageType: string;
    };

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
