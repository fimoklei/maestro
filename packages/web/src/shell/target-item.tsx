import type { TargetDriftIndicator } from "../drift/target-drift-indicator";
import { cn } from "../ui/cn";
import { StatusDot } from "../ui/status-dot";

// One row in the sidebar Targets list: a target's name plus its sync state. The
// StatusDot is decorative (aria-hidden by design); the state is carried in text
// so it reads for screen readers and never relies on colour alone. "unknown" and
// "checking" deliberately do not render as in-sync (the J04 rule). Typography is
// keyed to the target kind, per the Control Room sidebar: a global target reads
// in the UI font, a local repo path in dimmer mono (it is a path, not a name).
type TargetItemProps = {
  label: string;
  kind: "global" | "local";
  indicator: TargetDriftIndicator;
};

const STATUS_TEXT: Record<TargetDriftIndicator, string> = {
  ok: "in sync",
  drift: "needs update",
  unknown: "unknown",
  unverified: "unverified",
  pending: "checking…",
};

export function TargetItem({ label, kind, indicator }: TargetItemProps) {
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
      <span className="shrink-0 font-ui text-muted text-tag">
        {STATUS_TEXT[indicator]}
      </span>
    </li>
  );
}
