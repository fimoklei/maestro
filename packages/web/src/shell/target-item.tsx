import type { TargetDriftIndicator } from "../drift/drift-view-model";
import { cn } from "../ui/cn";
import { StatusDot } from "../ui/status-dot";

// One row in the sidebar Targets list: a target's name plus its sync state. The
// StatusDot is decorative (aria-hidden by design); the state is carried in text
// so it reads for screen readers and never relies on colour alone. "empty",
// "unknown", and "checking" deliberately do not render as in-sync (the J04
// rule). "empty" is the first-run reading — nothing deployed here yet, distinct
// from "unknown" (a check that could not run). Typography is keyed to the target
// kind, per the Control Room sidebar: a global target reads in the UI font, a
// local repo path in dimmer mono (it is a path, not a name).
type TargetItemProps = {
  label: string;
  kind: "global" | "local";
  indicator: TargetDriftIndicator;
  // How many deployed-here skills are behind, for the `▲N` badge. Only read in
  // the "drift" state, where it is always ≥ 1 (the roll-up never reports drift
  // with a zero count), so the sidebar never renders `▲0`.
  driftCount?: number;
  // Full, untruncated text shown on hover (native tooltip). A local target's
  // label is a shortened path, so the whole path stays reachable here (#211).
  title?: string;
};

// The right-slot reading per state: a visible marker, plus — where that marker is
// a glyph (`▲N`, `?`) rather than a word — the readable text a screen reader
// announces, so the state never relies on shape or colour alone. The plain-word
// states are already readable and carry no separate sr text. None reads as "in
// sync" except the ok state (J04).
function targetReading(
  indicator: TargetDriftIndicator,
  driftCount: number,
): { visible: string; sr?: string } {
  switch (indicator) {
    case "drift":
      return { visible: `▲${driftCount}`, sr: `${driftCount} behind` };
    case "unknown":
      return { visible: "?", sr: "unknown" };
    case "ok":
      return { visible: "in sync" };
    case "empty":
      return { visible: "empty" };
    case "unverified":
      return { visible: "unverified" };
    case "pending":
      return { visible: "checking…" };
  }
}

export function TargetItem({
  label,
  kind,
  indicator,
  driftCount,
  title,
}: TargetItemProps) {
  const reading = targetReading(indicator, driftCount ?? 0);
  return (
    <li className="flex items-center justify-between gap-2 px-3 py-1.5">
      <span className="flex items-center gap-2 truncate">
        {indicator === "ok" || indicator === "drift" ? (
          <StatusDot status={indicator} />
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
