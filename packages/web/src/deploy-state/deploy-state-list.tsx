import {
  type DriftStatus,
  type DriftView,
  orphanBehind,
  skillDriftStatus,
} from "../drift/drift-status";
import type { DeployTarget } from "../inventory/use-deploy-skill";
import { UpdateSkillAction } from "./update-skill-action";
import type { DeployedPrimitive, SkippedEntry } from "./use-deploy-state";

// Unstyled per-skill drift badge. Nothing renders while the check is still
// pending — the badge fills in when drift resolves; the rest of the row is
// already on screen.
const driftLabels: Record<Exclude<DriftStatus, "pending">, string> = {
  behind: "behind",
  "up-to-date": "up-to-date",
  unknown: "unknown",
};

function DriftBadge({ status }: { status: DriftStatus }) {
  if (status === "pending") {
    return null;
  }
  return <span> [{driftLabels[status]}]</span>;
}

// Presentational deploy-state for one repo. The empty state is explicit so a
// registered-but-empty repo never shows a bare blank. Skipped entries are shown
// as a warning, never dropped silently, so the cockpit cannot quietly hide a
// primitive it does not yet understand. The optional `drift` adds a per-skill
// badge; omitted (e.g. the global panel) means no badges. The `target` names
// the scope these primitives are deployed to (this repo, or global), so a
// behind row can offer a one-click Update against it.
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
  // warning would be the cockpit lying about an empty repo.
  const isEmpty = primitives.length === 0 && skipped.length === 0;
  // Behind names with no matching deployed skill — surfaced, never dropped.
  const orphans = orphanBehind(
    primitives.map((primitive) => primitive.name),
    drift,
  );

  return (
    <>
      {isEmpty && <p>Nothing deployed here.</p>}
      {primitives.length > 0 && (
        <ul>
          {primitives.map((primitive) => {
            const status = skillDriftStatus(primitive.name, drift);
            return (
              <li key={primitive.name}>
                <strong>{primitive.name}</strong>:{" "}
                <span>{primitive.version}</span>
                <DriftBadge status={status} />
                {/* Update is offered only when behind — never for up-to-date,
                    pending, or unknown (the J04 rule: unknown is not
                    actionable). */}
                {status === "behind" ? (
                  <UpdateSkillAction
                    skillName={primitive.name}
                    target={target}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {orphans.length > 0 && (
        <p>Also behind (not deployed here): {orphans.join(", ")}</p>
      )}
      {skipped.length > 0 && (
        <ul>
          {skipped.map((entry) => (
            <li key={entry.virtualPath}>
              Skipped {entry.virtualPath} (unsupported type {entry.packageType}
              ).
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
