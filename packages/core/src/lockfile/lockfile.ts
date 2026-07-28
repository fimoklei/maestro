// The single source of truth for apm.lock.yaml, so no two readers can disagree
// on whether one is valid. A malformed lockfile is a parse failure, never an
// empty stand-in for "I could not read this" (#58).
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
  dependencies: z.array(lockfileEntrySchema),
});

export type LockfileEntry = z.infer<typeof lockfileEntrySchema>;

type LockfileParseResult =
  | { ok: true; entries: LockfileEntry[] }
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
  return { ok: true, entries: parsed.data.dependencies };
}

// The identity rule, written once so no layer re-implements it.
export function claudeSkillName(entry: LockfileEntry): string | null {
  if (entry.package_type !== "claude_skill") {
    return null;
  }
  return basename(entry.virtual_path);
}
