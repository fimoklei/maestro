import type { TargetDriftIndicator } from "../drift/drift-view-model";
import { Chip } from "../ui/chip";
import { MIXED_RELEASES } from "./update-target-copy";

// One-glance drift roll-up in a target Card's header. Only the definite states
// render here — unknown/pending render nothing, so the header never falsely
// reads as in sync (J04, see deployed-view.ts).
export function TargetStatusChip({
  indicator,
  pinnedPerSkill = false,
  behind = false,
  mixedReleases = false,
}: {
  indicator: TargetDriftIndicator;
  // A target still deployed one skill at a time. It outranks every drift
  // reading: no release was adopted here, so none of them is the target's
  // status (ADR-0031, #950).
  pinnedPerSkill?: boolean;
  // The Release head's own reading: a target whose release is not the latest
  // one is behind, whatever the per-skill drift check made of it (ADR-0031).
  behind?: boolean;
  // An Update that apm ran and Maestro could not verify. The record survives
  // only where disk, manifest and lockfile disagree with what was asked for, so
  // the files really do differ by release (ADR-0031, #954).
  mixedReleases?: boolean;
}) {
  if (mixedReleases) {
    return <Chip tone="drift">▲ {MIXED_RELEASES}</Chip>;
  }
  if (pinnedPerSkill) {
    return <Chip tone="drift">▲ Pinned per skill</Chip>;
  }
  if (indicator === "ok") {
    return behind ? (
      <Chip tone="drift">▲ Behind</Chip>
    ) : (
      <Chip tone="ok">● In sync</Chip>
    );
  }
  if (indicator === "attention") {
    return <Chip tone="drift">▲ Attention</Chip>;
  }
  if (indicator === "drift") {
    return <Chip tone="drift">▲ Behind</Chip>;
  }
  // Neutral tone: empty is a fact, not a signal to act on. Word matches the
  // sidebar's ("Empty", never a synonym) so both readings agree.
  if (indicator === "empty") {
    return <Chip tone="dim">● Empty</Chip>;
  }
  // A target holding another inventory's primitives is not empty — word
  // matches the sidebar's ("Other origin") so both readings agree (#655).
  if (indicator === "foreign") {
    return <Chip tone="dim">● Other origin</Chip>;
  }
  return null;
}
