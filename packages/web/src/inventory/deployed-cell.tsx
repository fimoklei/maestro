import { Chip } from "../ui/chip";
import type { DeployedRollup } from "./deployed-rollup";

// From a DeployedRollup (deployed-rollup.ts), presents only. `?` is kept
// apart from ▲N and silence, so "we don't know" never reads up-to-date (J04).
export function DeployedCell({ rollup }: { rollup: DeployedRollup }) {
  const {
    targetCount,
    behindCount,
    unknownCount,
    pending,
    unreadable,
    checking,
  } = rollup;

  // A trailing … says more may be unread while loading/failed (J04).
  const unconfirmed = Boolean(pending || unreadable);
  // The reason doubles as the count-less label, so a failed read never falls
  // back to the loading wording the sr-only text would then contradict (R-A).
  const reachReason = unreadable
    ? "Deploy-state not read on every target"
    : "Loading deploy-state…";
  const reach =
    targetCount > 0
      ? `→ ${targetCount} ${targetCount === 1 ? "target" : "targets"}${
          unconfirmed ? " …" : ""
        }`
      : unconfirmed
        ? reachReason
        : "Not deployed";
  // Only the counted reach needs a second reading: with no count the visible
  // text is already the whole fact, and repeating it would announce it twice.
  const reachLabel =
    unconfirmed && targetCount > 0
      ? `${targetCount} ${
          targetCount === 1 ? "target" : "targets"
        }. ${reachReason}`
      : null;

  // Glyph is aria-hidden, sr-only label states the fact — same info a hover
  // tooltip gives a mouse (frontend.md).
  const behindLabel = `${behindCount} ${
    behindCount === 1 ? "target" : "targets"
  } behind`;
  const unknownLabel = `Update check did not run on ${unknownCount} ${
    unknownCount === 1 ? "target" : "targets"
  }`;

  return (
    <span className="flex items-center gap-2">
      <span className="text-dim text-tag" title={reachLabel ?? undefined}>
        {reachLabel === null ? (
          reach
        ) : (
          <>
            <span aria-hidden="true">{reach}</span>
            <span className="sr-only">{reachLabel}</span>
          </>
        )}
      </span>
      {behindCount > 0 ? (
        <Chip tone="drift" title={behindLabel}>
          <span aria-hidden="true">▲{behindCount}</span>
          <span className="sr-only">{behindLabel}</span>
        </Chip>
      ) : null}
      {unknownCount > 0 ? (
        <Chip tone="dim" title={unknownLabel}>
          <span aria-hidden="true">?</span>
          <span className="sr-only">{unknownLabel}</span>
        </Chip>
      ) : null}
      {checking ? <Chip tone="dim">Loading updates…</Chip> : null}
    </span>
  );
}
