// The single source of truth for apm.lock.yaml: its schema, a safe parse, and
// the deployed-claude-skill identity rule. Both DeployStateReader (the cockpit's
// deploy-state view) and the destination guard (DeployedContentAdapter) read the
// file through here, so the two layers can never disagree on whether a given
// lockfile is valid. A malformed lockfile is a parse failure surfaced to the
// caller — never an empty stand-in for "I couldn't read this" (#58).
import { basename } from "node:path";
import { parse } from "yaml";
import { z } from "zod";

// The fields both readers need across every entry. resolved_ref is the human tag
// (apm-driver.md) the deploy-state view shows; deployed_file_hashes is apm
// 0.20.0's per-file sha256 map the destination guard verifies against — optional
// because a pre-0.20.0 entry omits it. Unknown keys (content_hash, deployed_files)
// are ignored by Zod, as both layers already relied on.
const lockfileEntrySchema = z.object({
  resolved_ref: z.string(),
  virtual_path: z.string(),
  package_type: z.string(),
  deployed_file_hashes: z.record(z.string(), z.string()).optional(),
});

const lockfileSchema = z.object({
  dependencies: z.array(lockfileEntrySchema),
});

export type LockfileEntry = z.infer<typeof lockfileEntrySchema>;

export type LockfileParseResult =
  | { ok: true; entries: LockfileEntry[] }
  | { ok: false };

// Parse raw apm.lock.yaml text. A YAML syntax error or a schema mismatch yields
// { ok: false } — never a silently-empty list. Whether the file is present on
// disk is the caller's I/O concern; this only judges the text it is handed.
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

// The deployed-skill identity rule: an entry is a deployed claude skill when its
// package_type is claude_skill, and its name is the basename of virtual_path.
// Returns null for any other package_type, so both layers filter and name
// identically instead of re-implementing the rule.
export function claudeSkillName(entry: LockfileEntry): string | null {
  if (entry.package_type !== "claude_skill") {
    return null;
  }
  return basename(entry.virtual_path);
}
