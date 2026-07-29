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
  const reach =
    targetCount > 0
      ? `→ ${targetCount} ${targetCount === 1 ? "target" : "targets"}${
          unconfirmed ? " …" : ""
        }`
      : unconfirmed
        ? "…"
        : "not deployed";
  const reachReason = unreadable
    ? "deploy state could not be read on every target"
    : "still reading deploy state";
  const reachLabel =
    targetCount > 0
      ? `${targetCount} ${
          targetCount === 1 ? "target" : "targets"
        }; ${reachReason}`
      : reachReason;

  // Glyph is aria-hidden, sr-only label states the fact — same info a hover
  // tooltip gives a mouse (frontend.md).
  const behindLabel = `${behindCount} ${
    behindCount === 1 ? "target is" : "targets are"
  } behind the latest version`;
  const unknownLabel = `Drift check could not run on ${unknownCount} ${
    unknownCount === 1 ? "target" : "targets"
  }`;

  return (
    <span className="flex items-center gap-2">
      <span
        className="text-dim text-tag"
        title={unconfirmed ? reachLabel : undefined}
      >
        {unconfirmed ? (
          <>
            <span aria-hidden="true">{reach}</span>
            <span className="sr-only">{reachLabel}</span>
          </>
        ) : (
          reach
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
      {checking ? <Chip tone="dim">checking…</Chip> : null}
    </span>
  );
}
