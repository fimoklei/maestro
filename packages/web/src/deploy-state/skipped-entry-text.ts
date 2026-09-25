import { FIX_AND_RELEASE } from "./notice-copy";
import type { SkippedEntry } from "./use-deploy-state";

export function skippedEntryText(entry: SkippedEntry): string {
  if (entry.reason === "unsupported-type") {
    return `${entry.virtualPath} is deployed as ${entry.packageType}, which Maestro does not manage. Its files are still there.`;
  }
  if (entry.reason === "unmanageable-skill") {
    return `${entry.virtualPath} is deployed as ${entry.packageType}, not as a skill. ${FIX_AND_RELEASE}`;
  }
  if (entry.reason === "invalid-package") {
    return `The deploy of ${entry.virtualPath} landed no files. ${FIX_AND_RELEASE}`;
  }
  // About the one entry, never the file: the rest of the record was read fine (#357).
  return entry.virtualPath === null
    ? "One entry in the deployment record could not be read."
    : `The deployment record's entry for ${entry.virtualPath} could not be read.`;
}

export function skippedEntryKey(entry: SkippedEntry, index: number): string {
  return `${entry.reason}:${entry.virtualPath ?? index}`;
}

export function skippedNeedsAttention(entry: SkippedEntry): boolean {
  return (
    entry.reason === "unmanageable-skill" || entry.reason === "invalid-package"
  );
}
