// The legacy shape: one dependency per skill, each pinned at its own tag (#950).
import type { GitOrigin } from "../deploy/git-origin";
import { harnessSkillSubpath } from "../inventory/harness-layout";
import { claudeSkillName, type LockfileEntry } from "../lockfile/lockfile";
import type { PinnedPerSkill } from "./deploy-state-types";

export type SkillPin = { name: string; release: string };

// Null for every row not on the connected Harness; an unknown origin decides
// nothing, since attributing it would be a guess.
export function harnessSkillPin(
  entry: LockfileEntry,
  origin: GitOrigin | null,
): SkillPin | null {
  const name = claudeSkillName(entry);
  if (
    origin === null ||
    name === null ||
    entry.host !== origin.host ||
    entry.repo_url !== origin.ownerRepo ||
    entry.virtual_path !== harnessSkillSubpath(name)
  ) {
    return null;
  }
  return { name, release: entry.resolved_ref };
}

// Biggest group first. Undefined is "no such status".
export function tallyPins(
  pins: readonly SkillPin[],
): PinnedPerSkill | undefined {
  const byRelease = new Map<string, Set<string>>();
  for (const pin of pins) {
    const names = byRelease.get(pin.release) ?? new Set<string>();
    names.add(pin.name);
    byRelease.set(pin.release, names);
  }
  if (byRelease.size === 0) {
    return undefined;
  }
  return [...byRelease]
    .map(([release, names]) => ({ release, skills: names.size }))
    .sort((a, b) => b.skills - a.skills || b.release.localeCompare(a.release));
}
