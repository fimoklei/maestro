import { Chip } from "../ui/chip";
import type { DeployedRollup } from "./deployed-rollup";

// The deployed column's cell: one glance at a skill's reach and health. It reads a
// DeployedRollup (the pivot lives in deployed-rollup.ts) and renders three honest
// signals — the target count, a ▲N drift chip, and a separate ? marker. It only
// presents; it never re-derives the counts.
//
//   - `→ N targets` counts each tool and each repo the skill is deployed to; a
//     zero reach reads `not deployed`, never a blank (#272, AC #9).
//   - `▲N` counts the targets confirmed behind latest (AC #10).
//   - `?` marks targets whose drift check could not run — kept apart from ▲N and
//     from silence so "we don't know" never reads as "up to date" (J04, AC #11).
export function DeployedCell({ rollup }: { rollup: DeployedRollup }) {
  const {
    targetCount,
    behindCount,
    unknownCount,
    pending,
    unreadable,
    checking,
  } = rollup;

  // The reach is unconfirmed while any target's read is still loading or has
  // failed. Then a zero count must not read as a definite "deployed nowhere",
  // and a positive count is only a lower bound — a trailing … says more may be
  // unread (J04: unknown never reads as a fact).
  const unconfirmed = Boolean(pending || unreadable);
  const reach =
    targetCount > 0
      ? `→ ${targetCount} ${targetCount === 1 ? "target" : "targets"}${
          unconfirmed ? " …" : ""
        }`
      : unconfirmed
        ? "…"
        : "not deployed";
  // The screen-reader label mirrors what a sighted user sees: the confirmed
  // count (when any) followed by why the reach is not yet final, so an
  // assistive-tech user never loses the count the glyph shows.
  const reachReason = unreadable
    ? "deploy state could not be read on every target"
    : "still reading deploy state";
  const reachLabel =
    targetCount > 0
      ? `${targetCount} ${
          targetCount === 1 ? "target" : "targets"
        }; ${reachReason}`
      : reachReason;

  // Each marker carries its meaning as readable text, not a hover-only title:
  // the glyph is aria-hidden and a visually-hidden label states the fact, so
  // keyboard, touch, and screen-reader users get the same information a hover
  // tooltip gives a mouse (frontend.md a11y baseline).
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
