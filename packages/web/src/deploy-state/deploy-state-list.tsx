import {
  type DriftStatus,
  type DriftView,
  orphanBehind,
  skillDriftStatus,
} from "../drift/drift-status";
import type { DeployTarget } from "../inventory/use-deploy-skill";
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
  { tone: "ok" | "drift" | "dim"; label: string }
> = {
  behind: { tone: "drift", label: "behind" },
  "up-to-date": { tone: "ok", label: "up-to-date" },
  unknown: { tone: "dim", label: "unknown" },
};

function DriftBadge({ status }: { status: DriftStatus }) {
  if (status === "pending") {
    return null;
  }
  const { tone, label } = driftBadge[status];
  return <Chip tone={tone}>{label}</Chip>;
}

// The deployed version, warmed to amber when behind and shown as the
// deployed -> latest pair, green when up-to-date (ADR-0007).
const versionColor: Record<DriftStatus, string> = {
  behind: "text-amber-ink",
  "up-to-date": "text-green-ink",
  unknown: "text-muted",
  pending: "text-muted",
};

// Presentational deploy-state rows for one target. The empty state is explicit
// so a registered-but-empty target never shows a bare blank. Skipped entries are
// shown as a warning, never dropped silently. The optional `drift` adds the
// per-skill badge and the deployed -> latest pair; the `target` names the scope,
// so a behind row can offer a one-click Update against it.
export function DeployStateList({
  primitives,
  skipped,
  drift = { status: "pending" },
  target,
}: {
  primitives: DeployedPrimitive[];
  skipped: SkippedEntry[];
  drift?: DriftView;
  target: DeployTarget;
}) {
  // "Nothing deployed" only when there is genuinely nothing — not when entries
  // exist but were skipped as unsupported. Showing it alongside a skipped
  // warning would be the cockpit lying about an empty target.
  const isEmpty = primitives.length === 0 && skipped.length === 0;
  // Behind names with no matching deployed skill — surfaced, never dropped.
  const orphans = orphanBehind(
    primitives.map((primitive) => primitive.name),
    drift,
  );
  // The latest tag per behind skill, so a behind row can show the deployed ->
  // latest pair without a second apm call.
  const latestByName =
    drift.status === "ready"
      ? new Map(drift.behind.map((entry) => [entry.name, entry.latest]))
      : new Map<string, string>();

  return (
    <div className="py-1.5">
      {isEmpty && (
        <p className="px-card-x py-row-y text-dim text-tag">
          Nothing deployed here.
        </p>
      )}
      {primitives.map((primitive) => {
        const status = skillDriftStatus(primitive.name, drift);
        const latest = latestByName.get(primitive.name);
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
