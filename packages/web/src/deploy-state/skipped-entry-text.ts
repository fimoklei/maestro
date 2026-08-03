// One sentence per skipped entry, written once so the repo panel and the global
// panel cannot word the same state differently.
import type { SkippedEntry } from "./use-deploy-state";

const RELEASE_AGAIN =
  "Fix the package shape in the harness, release a corrected tag, and deploy again.";

export function skippedEntryText(entry: SkippedEntry): string {
  if (entry.reason === "unsupported-type") {
    return `Skipped ${entry.virtualPath} — Maestro does not manage ${entry.packageType}. Its files are still in place.`;
  }
  if (entry.reason === "unmanageable-skill") {
    return `${entry.virtualPath} is deployed as ${entry.packageType}, which Maestro cannot manage as a skill. Its files are still in place. ${RELEASE_AGAIN}`;
  }
  if (entry.reason === "invalid-package") {
    return `apm recorded ${entry.virtualPath} as a failed deployment and placed no files. ${RELEASE_AGAIN}`;
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

// Amber, and a target status of its own: a package the user can recover is not
// the same as a primitive Maestro simply does not manage (#358).
export function skippedNeedsAttention(entry: SkippedEntry): boolean {
  return (
    entry.reason === "unmanageable-skill" || entry.reason === "invalid-package"
  );
}
