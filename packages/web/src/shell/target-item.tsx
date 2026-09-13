import type { TargetDriftIndicator } from "../drift/drift-view-model";
import { cn } from "../ui/cn";
import { StatusDot } from "../ui/status-dot";

// One row in the sidebar Targets list. StatusDot is decorative (aria-hidden);
// state is carried in text, never colour alone. "Empty"/"Unknown"/"Checking"
// never render as in-sync (J04, see deploy-state/deployed-view.ts).
type TargetItemProps = {
  label: string;
  kind: "global" | "local";
  indicator: TargetDriftIndicator;
  // Only read in "drift" state, always ≥ 1 — never renders `▲0`.
  driftCount?: number;
  // A target still deployed one skill at a time. It outranks every drift
  // reading: no release was adopted here (ADR-0031, #950).
  pinnedPerSkill?: boolean;
  // The Release head's own reading. The per-skill drift check answers nothing
  // for a target that follows one release, so without this the row read as In
  // sync (ADR-0031, #956).
  behind?: boolean;
  // How many selected skills the newer release changed. Zero is a real
  // reading: a release can move ahead without touching this selection.
  changedCount?: number;
  // Full path on hover — the label is a shortened path (#211).
  title?: string;
};

// Where the visible marker is a glyph, sr carries the readable text, so state
// never relies on shape or colour alone.
function targetReading(
  indicator: TargetDriftIndicator,
  driftCount: number,
  head: { pinnedPerSkill: boolean; behind: boolean; changedCount: number },
): { visible: string; sr?: string } {
  // Same precedence as the card's status chip, so the two readings of one
  // target always agree (target-status-chip.tsx).
  if (head.pinnedPerSkill) {
    return { visible: "Pinned per skill" };
  }
  if (head.behind && indicator === "ok") {
    return head.changedCount > 0
      ? behindReading(head.changedCount)
      : { visible: "Behind" };
  }
  switch (indicator) {
    case "drift":
      return behindReading(driftCount);
    case "unknown":
      return { visible: "?", sr: "Unknown" };
    case "ok":
      return { visible: "In sync" };
    case "empty":
      return { visible: "Empty" };
    case "foreign":
      return { visible: "Other origin" };
    case "attention":
      return { visible: "Attention" };
    case "unverified":
      return { visible: "Unverified" };
    case "pending":
      return { visible: "Checking…" };
  }
}

const behindReading = (count: number) => ({
  visible: `▲${count}`,
  sr: `${count} ${count === 1 ? "skill" : "skills"} behind`,
});

export function TargetItem({
  label,
  kind,
  indicator,
  driftCount,
  pinnedPerSkill = false,
  behind = false,
  changedCount = 0,
  title,
}: TargetItemProps) {
  const reading = targetReading(indicator, driftCount ?? 0, {
    pinnedPerSkill,
    behind,
    changedCount,
  });
  return (
    <li className="flex items-center justify-between gap-2 px-3 py-1.5">
      <span className="flex items-center gap-2 truncate">
        {pinnedPerSkill || behind || indicator === "drift" ? (
          <StatusDot status="drift" />
        ) : indicator === "ok" ? (
          <StatusDot status="ok" />
        ) : (
          <span
            aria-hidden="true"
            className={cn("inline-block size-1.5 shrink-0 rounded-full bg-dim")}
          />
        )}
        <span
          title={title}
          className={cn(
            "truncate",
            kind === "local"
              ? "font-mono text-mono-sm text-muted"
              : "font-ui text-desc text-fg-3",
          )}
        >
          {label}
        </span>
      </span>
      <span
        className="shrink-0 font-ui text-muted text-tag"
        title={reading.sr ?? reading.visible}
      >
        {reading.sr ? (
          <>
            <span aria-hidden="true">{reading.visible}</span>
            <span className="sr-only">{reading.sr}</span>
          </>
        ) : (
          reading.visible
        )}
      </span>
    </li>
  );
}
