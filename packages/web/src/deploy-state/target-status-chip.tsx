import type { TargetDriftIndicator } from "../drift/drift-view-model";
import { Chip } from "../ui/chip";

// One-glance drift roll-up in a target Card's header. Only the definite states
// render here — unknown/pending render nothing, so the header never falsely
// reads as in sync (J04, see deployed-view.ts).
export function TargetStatusChip({
  indicator,
  pinnedPerSkill = false,
}: {
  indicator: TargetDriftIndicator;
  // A target still deployed one skill at a time. It outranks every drift
  // reading: no release was adopted here, so none of them is the target's
  // status (ADR-0031, #950).
  pinnedPerSkill?: boolean;
}) {
  if (pinnedPerSkill) {
    return <Chip tone="drift">▲ Pinned per skill</Chip>;
  }
  if (indicator === "ok") {
    return <Chip tone="ok">● In sync</Chip>;
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
