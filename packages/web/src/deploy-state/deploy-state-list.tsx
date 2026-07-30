import type { RemoveOutcome } from "@maestro/core";
import { useEffect, useState } from "react";
import { HttpError } from "../api/http";
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
import { removalOutcome } from "./removal-outcome";
import { RemovalTrace, type TracedRemoval } from "./removal-trace";
import type { RemoveDialogTarget } from "./remove-ledger-rows";
import { removePreflightView } from "./remove-preflight-view";
import { RemoveSkillDialog } from "./remove-skill-dialog";
import { UpdateSkillAction } from "./update-skill-action";
import type { DeployedPrimitive, SkippedEntry } from "./use-deploy-state";
import { useRemoveDeployedSkill } from "./use-remove-deployed-skill";
import { useRemovePreflight } from "./use-remove-preflight";

// Per-skill drift badge. State is carried in text, never colour alone, so
// "unknown" never reads as up-to-date (J04). Renders nothing while pending.
const driftBadge: Record<
  Exclude<DriftStatus, "pending">,
  { tone: "ok" | "drift" | "dim"; label: string; hint?: string }
> = {
  behind: { tone: "drift", label: "behind" },
  "up-to-date": { tone: "ok", label: "up-to-date" },
  unknown: { tone: "dim", label: "unknown" },
  // Distinct label + hint so a reachability failure reads as auth/network, not
  // a generic unknown.
  unverified: {
    tone: "dim",
    label: "unverified",
    hint: "Couldn't reach the source to check for updates — verify apm auth/network.",
  },
};

// The target is provably clean. Read after an attempt that already failed, it
// says that attempt landed: apm can remove a skill and still fail to prove it,
// which takes the lockfile entry with it (apm-driver.md § Remove).
const alreadyGone = (error: unknown) =>
  error instanceof HttpError && error.code === "not-deployed";

// What the panel needs to report a failure: apm's own words, and what the
// server proved about each target afterwards.
type RemovalFailure = {
  message: string;
  outcome: RemoveOutcome | null;
};

// apm's own words when the server sent them, a plain sentence otherwise.
const removalFailure = (error: unknown): RemovalFailure => ({
  message:
    error instanceof HttpError
      ? error.message
      : "The removal could not be completed.",
  outcome: removalOutcome(error),
});

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

// Presentational rows for one target. A genuinely empty target renders no
// body — the card header's "● empty" chip already states it. Pending default
// avoids a spurious badge before the drift query resolves.
const PENDING_DRIFT = driftViewModel({ data: undefined, isError: false });

export function DeployStateList({
  primitives,
  skipped,
  drift = PENDING_DRIFT,
  target,
  onRemoved,
}: {
  primitives: DeployedPrimitive[];
  skipped: SkippedEntry[];
  drift?: DriftViewModel;
  // Required, not optional: a global target's tools must be present or the
  // confirmation can't render, and an optional prop could drop them (#338).
  target: RemoveDialogTarget;
  // Called after the dialog is gone — a successful removal destroys the
  // trigger the modal's own focus-restore would otherwise aim at.
  onRemoved?: () => void;
}) {
  const [removing, setRemoving] = useState<string | null>(null);
  // Held here rather than read off the mutation: starting the retry clears the
  // mutation's error, and the panel would leave its failed state during the
  // attempt that state offered (#415). Message and outcome travel together, so
  // a ledger can never outlive the failure it reports on (#416).
  const [failure, setFailure] = useState<RemovalFailure | null>(null);
  const [justRemoved, setJustRemoved] = useState(false);
  const [removed, setRemoved] = useState<TracedRemoval[]>([]);
  const remove = useRemoveDeployedSkill();
  // Global's location is apm's own, resolved server-side (J07).
  const wireTarget: DeployTarget =
    target.kind === "repo" ? target : { kind: "global" };
  const preflight = useRemovePreflight(removing, wireTarget);

  // In an effect, not the success handler: the modal's focus-restore runs
  // during its unmount and would overwrite an earlier move.
  useEffect(() => {
    if (justRemoved) {
      setJustRemoved(false);
      onRemoved?.();
    }
  }, [justRemoved, onRemoved]);

  // Genuinely nothing — a skipped-only target still falls through to its
  // warning below, and a card just emptied by its own removal shows the trace.
  if (primitives.length === 0 && skipped.length === 0 && removed.length === 0) {
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
            {status === "behind" ? (
              <UpdateSkillAction
                skillName={primitive.name}
                target={wireTarget}
              />
            ) : null}
            <ActionsMenu
              label={`Actions for ${primitive.name}`}
              items={[
                {
                  label: "remove…",
                  onSelect: () => {
                    remove.reset();
                    setFailure(null);
                    setRemoving(primitive.name);
                  },
                },
              ]}
            />
          </div>
        );
      })}
      {removing !== null ? (
        <RemoveSkillDialog
          skillName={removing}
          // Null rather than a guess if the list no longer carries this skill.
          version={
            primitives.find((primitive) => primitive.name === removing)
              ?.version ?? null
          }
          target={target}
          isRemoving={remove.isPending}
          preflight={removePreflightView(preflight)}
          error={failure?.message ?? null}
          outcome={failure?.outcome ?? null}
          onCancel={() => setRemoving(null)}
          onConfirm={() =>
            remove.mutate(
              {
                type: "skill",
                name: removing,
                target: wireTarget,
                // The token that came with the paths the dialog just named, not
                // a client-rebuilt list a direct request could guess.
                confirmedReclaimToken: preflight.data?.reclaim?.token,
              },
              {
                onError: (error) => {
                  if (failure !== null && alreadyGone(error)) {
                    setFailure(null);
                    setRemoving(null);
                    setJustRemoved(true);
                    return;
                  }
                  setFailure(removalFailure(error));
                },
                // Only a proven removal closes the dialog — a failure keeps it
                // open with apm's reason.
                onSuccess: (data) => {
                  const scope = data.removed.scope;
                  setRemoved((seen) => [
                    ...seen,
                    {
                      id: seen.length,
                      name: data.removed.name,
                      version: data.removed.version,
                      // No scope in the response falls back to what the user
                      // consented to, never a guess at a different target.
                      target:
                        scope?.kind === "global"
                          ? { kind: "global", tools: scope.tools }
                          : target,
                    },
                  ]);
                  setRemoving(null);
                  setJustRemoved(true);
                },
              },
            )
          }
        />
      ) : null}
      <RemovalTrace removed={removed} />
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
