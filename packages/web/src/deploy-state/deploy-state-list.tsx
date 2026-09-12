import type { RemoveOutcome } from "@maestro/core";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { HttpError } from "../api/http";
import {
  type DriftStatus,
  type DriftViewModel,
  driftViewModel,
  lagsPin,
} from "../drift/drift-view-model";
import { versionColor } from "../drift/version-color";
import type { DeployTarget } from "../inventory/use-deploy-skill";
import { ActionsMenu } from "../ui/actions-menu";
import { Chip } from "../ui/chip";
import { cn } from "../ui/cn";
import { type DeployStateNotice, removeNotice } from "./notice-copy";
import { copyChipText, extraFilesLine } from "./release-head-copy";
import { removalOutcome } from "./removal-outcome";
import { RemovalTrace, type TracedRemoval } from "./removal-trace";
import type { RemoveDialogTarget } from "./remove-ledger-rows";
import { removePreflightView } from "./remove-preflight-view";
import { RemoveSkillDialog } from "./remove-skill-dialog";
import { restatedCost } from "./restated-cost";
import {
  skippedEntryKey,
  skippedEntryText,
  skippedNeedsAttention,
} from "./skipped-entry-text";
import type { DeployedPrimitive, SkippedEntry } from "./use-deploy-state";
import { useRemoveDeployedSkill } from "./use-remove-deployed-skill";
import {
  type RemovePreflight,
  removePreflightQueryOptions,
  useRemovePreflight,
} from "./use-remove-preflight";

// Per-skill drift badge. State is carried in text, never colour alone, so
// "unknown" never reads as up-to-date (J04). Renders nothing while pending.
// *Older tag* is retired with the per-skill release it implied: the skill is
// identical at both tags, so nothing marks the row (ADR-0031, #956).
const driftBadge: Partial<
  Record<
    DriftStatus,
    { tone: "ok" | "drift" | "dim"; label: string; hint?: string }
  >
> = {
  behind: { tone: "drift", label: "Behind" },
  "no-longer-released": {
    tone: "drift",
    label: "No longer released",
    hint: "This deployed skill is absent from the latest release",
  },
  "up-to-date": { tone: "ok", label: "Up to date" },
  unknown: { tone: "dim", label: "Unknown" },
  // Distinct label + hint so a reachability failure reads as unreached, not a
  // generic unknown.
  unverified: {
    tone: "dim",
    label: "Unverified",
    hint: "Could not reach the Harness location to check for updates",
  },
};

// The target is provably clean. Read after an attempt that already failed, it
// says that attempt landed: apm can remove a skill and still fail to prove it,
// which takes the lockfile entry with it (apm-driver.md § Remove).
const alreadyGone = (error: unknown) =>
  error instanceof HttpError && error.code === "not-deployed";

// What one attempt came back with. One union rather than two states, because
// an attempt has one outcome: a removal that ran and failed, or one that ran
// nothing because its cost was never agreed to (#364).
type RemovalNews =
  // The removal's own notice for the code the server sent, and what the server
  // proved about each target afterwards.
  | { kind: "failed"; notice: DeployStateNotice; outcome: RemoveOutcome | null }
  // The notice for a removal the server did not start.
  | { kind: "restated"; notice: DeployStateNotice };

const removalFailure = (error: unknown): RemovalNews => ({
  kind: "failed",
  notice: removeNotice(error),
  outcome: removalOutcome(error),
});

function DriftBadge({ status }: { status: DriftStatus }) {
  const badge = driftBadge[status];
  if (badge === undefined) {
    return null;
  }
  return (
    <Chip tone={badge.tone} title={badge.hint}>
      {badge.label}
    </Chip>
  );
}

// The copy's own reading, beside the drift one: a row can be up to date and
// still hold work the next install would overwrite (#931).
function CopyChip({ copy }: { copy: DeployedPrimitive["copy"] }) {
  if (copy === undefined) {
    return null;
  }
  const { label, hint } = copyChipText(copy);
  return (
    <Chip tone="drift" title={hint}>
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
  headRelease,
  extraFiles,
  target,
  onRemoved,
}: {
  primitives: DeployedPrimitive[];
  skipped: SkippedEntry[];
  drift?: DriftViewModel;
  // How many recorded files belong to no selected skill. A fact under the rows,
  // in the shape of the skipped list — never a chip, never its own card (#950).
  extraFiles?: number;
  // The release the whole target follows. A row states its own release only
  // where it disagrees with this one, so one release is stated once (ADR-0031).
  headRelease?: string;
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
  const [news, setNews] = useState<RemovalNews | null>(null);
  const [justRemoved, setJustRemoved] = useState(false);
  const [removed, setRemoved] = useState<TracedRemoval[]>([]);
  const queryClient = useQueryClient();
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
  if (
    primitives.length === 0 &&
    skipped.length === 0 &&
    removed.length === 0 &&
    (extraFiles ?? 0) === 0
  ) {
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
            // Wraps rather than crushing the name: the version column drops
            // first, then the chips move under the name (ADR-0031).
            className="flex flex-wrap items-center gap-x-3 gap-y-1 px-card-x py-row-y"
          >
            <span className="min-w-[8ch] flex-1 truncate font-mono text-data text-fg">
              {primitive.name}
            </span>
            {primitive.version === headRelease ? null : (
              <span className={cn("font-mono text-tag", versionColor[status])}>
                {lagsPin(status) && latest
                  ? `${primitive.version} → ${latest}`
                  : primitive.version}
              </span>
            )}
            <CopyChip copy={primitive.copy} />
            <DriftBadge status={status} />
            <ActionsMenu
              label={`Actions for ${primitive.name}`}
              items={[
                {
                  label: "Remove skill",
                  onSelect: () => {
                    remove.reset();
                    setNews(null);
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
          error={news?.kind === "failed" ? news.notice : null}
          restated={news?.kind === "restated" ? news.notice : null}
          outcome={news?.kind === "failed" ? news.outcome : null}
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
                // The answer this very dialog stated the cost from, so the
                // server can tell a confirmed removal from a claimed one.
                confirmedRemovalReceipt: preflight.data?.receipt,
              },
              {
                onError: (error) => {
                  if (news?.kind === "failed" && alreadyGone(error)) {
                    setNews(null);
                    setRemoving(null);
                    setJustRemoved(true);
                    return;
                  }
                  // The server priced the copy again and took no action. Its
                  // answer replaces the one on screen whole — cost, receipt and
                  // leftovers — so the next confirm can never pair one attempt's
                  // price with another's consent (#364).
                  const cost = restatedCost(error);
                  if (cost !== null) {
                    queryClient.setQueryData(
                      removePreflightQueryOptions(removing, wireTarget)
                        .queryKey,
                      (): RemovePreflight => ({
                        check: cost.check,
                        receipt: cost.receipt,
                        reclaim: cost.reclaim,
                      }),
                    );
                    setNews({ kind: "restated", notice: removeNotice(error) });
                    return;
                  }
                  setNews(removalFailure(error));
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
          Reported behind, not deployed here: {orphans.join(", ")}
        </p>
      )}
      {extraFiles === undefined || extraFiles === 0 ? null : (
        <p className="px-card-x py-row-y text-dim text-tag">
          {extraFilesLine(extraFiles)}
        </p>
      )}
      {skipped.length > 0 && (
        <ul className="space-y-1 px-card-x py-row-y text-tag">
          {skipped.map((entry, index) => (
            <li
              key={skippedEntryKey(entry, index)}
              className={
                skippedNeedsAttention(entry) ? "text-amber-ink" : "text-dim"
              }
            >
              {skippedEntryText(entry)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
