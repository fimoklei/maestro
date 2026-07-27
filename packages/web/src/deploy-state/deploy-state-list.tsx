import {
  type DriftStatus,
  type DriftViewModel,
  driftViewModel,
} from "../drift/drift-view-model";
import { versionColor } from "../drift/version-color";
import type { DeployTarget } from "../inventory/use-deploy-skill";
import { ActionsMenu } from "../ui/actions-menu";
import { Chip } from "../ui/chip";
import { cn } from "../ui/cn";
import { UpdateSkillAction } from "./update-skill-action";
import type { DeployedPrimitive, SkippedEntry } from "./use-deploy-state";

// Per-skill drift badge as a Control Room Chip. The state is carried in text
// (not colour alone) so it stays accessible and honest: "unknown" reads as
// unknown, never as up-to-date (J04). Nothing renders while the check is still
// pending — the badge fills in when drift resolves.
const driftBadge: Record<
  Exclude<DriftStatus, "pending">,
  { tone: "ok" | "drift" | "dim"; label: string; hint?: string }
> = {
  behind: { tone: "drift", label: "behind" },
  "up-to-date": { tone: "ok", label: "up-to-date" },
  unknown: { tone: "dim", label: "unknown" },
  // Same neutral tone as unknown (state is carried in text, not colour), but a
  // distinct label + hint so a reachability failure reads as auth/network, not a
  // generic unknown — and never as up-to-date (J04).
  unverified: {
    tone: "dim",
    label: "unverified",
    hint: "Couldn't reach the source to check for updates — verify apm auth/network.",
  },
};

function DriftBadge({ status }: { status: DriftStatus }) {
  if (status === "pending") {
    return null;
  }
  const { tone, label, hint } = driftBadge[status];
  return (
    <Chip tone={tone} title={hint}>
      {label}
    </Chip>
  );
}

// Presentational deploy-state rows for one target. A genuinely empty target
// renders no body at all: its card header carries the "● empty" status chip,
// which states the same fact without a sentence per card. Skipped entries are
// shown as a warning, never dropped silently. The optional `drift` adds the
// per-skill badge and the deployed -> latest pair; the `target` names the scope,
// so a behind row can offer a one-click Update against it.
// A pending model is the default so a list rendered before its drift query
// resolves shows no badge, rather than a spurious one.
const PENDING_DRIFT = driftViewModel({ data: undefined, isError: false });

export function DeployStateList({
  primitives,
  skipped,
  drift = PENDING_DRIFT,
  target,
}: {
  primitives: DeployedPrimitive[];
  skipped: SkippedEntry[];
  drift?: DriftViewModel;
  target: DeployTarget;
}) {
  // Genuinely nothing — not entries that exist but were skipped as unsupported.
  // Treating a skipped-only target as empty would be the cockpit lying about it,
  // so that case falls through and still renders its warning below.
  if (primitives.length === 0 && skipped.length === 0) {
    return null;
  }

  // Behind names with no matching deployed skill — surfaced, never dropped.
  const orphans = drift.orphanBehind(
    primitives.map((primitive) => primitive.name),
  );

  return (
    <div className="py-1.5">
      {primitives.map((primitive) => {
        const status = drift.skillStatus(primitive.name);
        // The latest tag lets a behind row show the deployed -> latest pair
        // without a second apm call.
        const latest = drift.latest(primitive.name);
        return (
          <div
            key={primitive.name}
            className="flex items-center gap-3 px-card-x py-row-y"
          >
            <span className="flex-1 truncate font-mono text-data text-fg">
              {primitive.name}
            </span>
            <span className={cn("font-mono text-tag", versionColor[status])}>
              {status === "behind" && latest
                ? `${primitive.version} → ${latest}`
                : primitive.version}
            </span>
            <DriftBadge status={status} />
            {/* Update is offered only when behind — never for up-to-date,
                pending, or unknown (the J04 rule: unknown is not actionable). */}
            {status === "behind" ? (
              <UpdateSkillAction skillName={primitive.name} target={target} />
            ) : null}
            {/* The row's named actions, last in the row and always visible so
                they exist for touch and keyboard, not only for a mouse. Empty
                until Remove lands (#158) — the trigger stays inert until then. */}
            <ActionsMenu label={`Actions for ${primitive.name}`} items={[]} />
          </div>
        );
      })}
      {orphans.length > 0 && (
        <p className="px-card-x py-row-y text-amber-ink text-tag">
          Also behind (not deployed here): {orphans.join(", ")}
        </p>
      )}
      {skipped.length > 0 && (
        <ul className="px-card-x py-row-y text-dim text-tag">
          {skipped.map((entry) => (
            <li key={entry.virtualPath}>
              Skipped {entry.virtualPath} (unsupported type {entry.packageType}
              ).
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
