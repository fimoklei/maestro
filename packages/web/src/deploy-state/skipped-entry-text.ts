import type { SkippedEntry } from "@maestro/core";
import { FIX_AND_RELEASE } from "./notice-copy";

/** What went wrong with an entry, without its fix: the Status hover card's reason. */
export function skippedEntryReason(entry: SkippedEntry): string {
  if (entry.reason === "unsupported-type") {
    return `${entry.virtualPath} is deployed as ${entry.packageType}, which Maestro does not manage. Its files are still there.`;
  }
  if (entry.reason === "unmanageable-skill") {
    return `${entry.virtualPath} is deployed as ${entry.packageType}, not as a skill.`;
  }
  if (entry.reason === "invalid-package") {
    return `The deploy of ${entry.virtualPath} landed no files.`;
  }
  // About the one entry, never the file: the rest of the record was read fine (#357).
  return entry.virtualPath === null
    ? "One entry in the deployment record could not be read."
    : `The deployment record's entry for ${entry.virtualPath} could not be read.`;
}

export function skippedEntryText(entry: SkippedEntry): string {
  const reason = skippedEntryReason(entry);
  return skippedNeedsAttention(entry) ? `${reason} ${FIX_AND_RELEASE}` : reason;
}

export function skippedEntryKey(entry: SkippedEntry, index: number): string {
  return `${entry.reason}:${entry.virtualPath ?? index}`;
}

export function skippedNeedsAttention(entry: SkippedEntry): boolean {
  return (
    entry.reason === "unmanageable-skill" || entry.reason === "invalid-package"
  );
}
