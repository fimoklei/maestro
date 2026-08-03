// One sentence per skipped entry, written once so the repo panel and the global
// panel cannot word the same state differently.
import type { SkippedEntry } from "./use-deploy-state";

export function skippedEntryText(entry: SkippedEntry): string {
  if (entry.reason === "unsupported-type") {
    return `Skipped ${entry.virtualPath} (unsupported type ${entry.packageType}).`;
  }
  // Deliberately about the one entry, never the file: the rest of the lockfile
  // was read fine (#357).
  return entry.virtualPath === null
    ? "Could not read one lockfile entry."
    : `Could not read the lockfile entry for ${entry.virtualPath}.`;
}

export function skippedEntryKey(entry: SkippedEntry, index: number): string {
  return `${entry.reason}:${entry.virtualPath ?? index}`;
}
