import { updatingLine } from "./update-target-copy";

// The card, and the global section, while apm runs: one fact in place of their
// controls, so a second operation cannot be started from here (spec story 27,
// #954). Only the disabled Update target trigger stays, to keep its dialog (#980).
export function UpdatingLine({ release }: { release: string }) {
  return (
    <p className="px-card-x py-row-y text-dim text-tag" role="status">
      {updatingLine(release)}
    </p>
  );
}
