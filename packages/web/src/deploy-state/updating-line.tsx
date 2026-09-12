import { updatingLine } from "./update-target-copy";

// The card, and the global section, while apm runs: no control, one fact. The
// controls are gone rather than dimmed, so a second operation cannot be started
// from here at all (spec story 27, #954).
export function UpdatingLine({ release }: { release: string }) {
  return (
    <p className="px-card-x py-row-y text-dim text-tag" role="status">
      {updatingLine(release)}
    </p>
  );
}
