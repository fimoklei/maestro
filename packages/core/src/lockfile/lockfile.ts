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
  virtual_path: z.string(),
  package_type: z.string(),
  host: z.string().optional(),
  repo_url: z.string().optional(),
  deployed_files: z.array(z.string()).optional(),
  deployed_file_hashes: z.record(z.string(), z.string()).optional(),
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
    if (entry.success) {
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

// The identity rule, written once so no layer re-implements it.
export function claudeSkillName(entry: LockfileEntry): string | null {
  if (entry.package_type !== "claude_skill") {
    return null;
  }
  return basename(entry.virtual_path);
}
