// The shape every target held before ADR-0031: one dependency per skill, each
// pinned at its own tag. Read here so the cockpit can tell such a target apart
// from one on a single release, and name the way out (#950).
import type { GitOrigin } from "../deploy/git-origin";
import { harnessSkillSubpath } from "../inventory/harness-layout";
import { claudeSkillName, type LockfileEntry } from "../lockfile/lockfile";
import type { PinnedPerSkill } from "./deploy-state-types";

export type SkillPin = { name: string; release: string };

// A per-skill dependency on the connected Harness, or null for every other row.
// A foreign or unknown origin decides no status and blocks nothing: attributing
// one would be a guess (ADR-0031, #950, J04).
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
    // The row names one skill; the pin must name that same skill.
    entry.virtual_path !== harnessSkillSubpath(name)
  ) {
    return null;
  }
  return { name, release: entry.resolved_ref };
}

// How many skills sit on each release, biggest group first so the card leads
// with the release most of the target is on. Undefined is "no such status".
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
