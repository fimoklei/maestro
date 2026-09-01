import type { TargetDriftIndicator } from "../drift/drift-view-model";
import { Chip } from "../ui/chip";

// One-glance drift roll-up in a target Card's header. Only the definite states
// render here — unknown/pending render nothing, so the header never falsely
// reads as in sync (J04, see deployed-view.ts).
export function TargetStatusChip({
  indicator,
}: {
  indicator: TargetDriftIndicator;
}) {
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
  return null;
}
