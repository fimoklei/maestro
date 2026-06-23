import type { TargetDriftIndicator } from "../drift/target-drift-indicator";
import { Chip } from "../ui/chip";

// The status Chip in a target Card's header: a one-glance roll-up of the whole
// target's drift. The caller computes the indicator (joining drift against the
// target's deployed primitives), so the header and the sidebar never disagree
// and an orphan-behind never flips the header to "drift". It shows only the
// definite states — "in sync" or "drift". Unknown and pending render nothing
// here (the per-skill rows carry "unknown"), so the header never falsely reads
// as in sync (J04) and never double-states "unknown" against the rows.
export function TargetStatusChip({
  indicator,
}: {
  indicator: TargetDriftIndicator;
}) {
  if (indicator === "ok") {
    return <Chip tone="ok">● in sync</Chip>;
  }
  if (indicator === "drift") {
    return <Chip tone="drift">▲ drift</Chip>;
  }
  return null;
}
