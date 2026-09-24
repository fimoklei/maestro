import type { RemoveOutcome } from "@maestro/core";
import { useQueryClient } from "@tanstack/react-query";
import { EllipsisVertical } from "lucide-react";
import { type Ref, useEffect, useState } from "react";
import { HttpError } from "../api/http";
import {
  type DriftViewModel,
  driftViewModel,
  lagsPin,
} from "../drift/drift-view-model";
import type { DeployTarget } from "../inventory/use-deploy-skill";
import { ActionsMenu } from "../ui/actions-menu";
import { cn } from "../ui/cn";
import { MachineValue } from "../ui/machine-value";
import { showSuccess } from "../ui/toast";
import { Tooltip } from "../ui/tooltip";
import { type DeployStateNotice, removeNotice } from "./notice-copy";
import { removalAnnouncement } from "./removal-announcement";
import { removalOutcome } from "./removal-outcome";
import type { RemoveDialogTarget } from "./remove-ledger-rows";
import { removePreflightView } from "./remove-preflight-view";
import { RemoveSkillDialog } from "./remove-skill-dialog";
import { restatedCost } from "./restated-cost";
import { type SkillMark, skillMark } from "./skill-mark";
import type { DeployedPrimitive } from "./use-deploy-state";
import { useRemoveDeployedSkill } from "./use-remove-deployed-skill";
import {
  type RemovePreflight,
  removePreflightQueryOptions,
  useRemovePreflight,
} from "./use-remove-preflight";

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

// A shape, so the reading survives without colour; its word is its name.
function Mark({ mark }: { mark: SkillMark | null }) {
  return (
    // 24×24, the pointer floor (WCAG 2.2 SC 2.5.8), inside the 32px row.
    <span className="inline-flex w-6 flex-none justify-center">
      {mark === null ? null : (
        <Tooltip label={mark.word} detail={mark.hint}>
          <span
            role="img"
            aria-label={mark.word}
            // biome-ignore lint/a11y/noNoninteractiveTabindex: a tooltip trigger, so its reading opens from the keyboard too (#1068)
            tabIndex={0}
            className={cn(
              "inline-flex size-6 items-center justify-center rounded-control focus-visible:outline-2 focus-visible:outline-blue-9 focus-visible:outline-offset-2",
              mark.family === "attention"
                ? "text-amber-11"
                : mark.family === "good"
                  ? "text-green-11"
                  : "text-gray-11",
            )}
          >
            {mark.glyph}
          </span>
        </Tooltip>
      )}
    </span>
  );
}

// Pending default avoids a spurious mark before the drift query resolves.
const PENDING_DRIFT = driftViewModel({ data: undefined, isError: false });

// A target's Selected skills in its detail pane (#993): one 32px row per
// skill carrying one mark, and the removal flow behind each row's menu.
export function SelectedSkills({
  primitives,
  drift = PENDING_DRIFT,
  target,
  targetName,
  onRemoved,
  headingRef,
}: {
  primitives: DeployedPrimitive[];
  drift?: DriftViewModel;
  // Required, not optional: a global target's tools must be present or the
  // confirmation can't render, and an optional prop could drop them (#338).
  target: RemoveDialogTarget;
  /** The target as the table names it, for the removal's toast. */
  targetName: string;
  // Called after the dialog is gone — a successful removal destroys the
  // trigger the modal's own focus-restore would otherwise aim at.
  onRemoved?: () => void;
  /** Where the owner sends focus once a removed row is gone. */
  headingRef?: Ref<HTMLHeadingElement>;
}) {
  const [removing, setRemoving] = useState<string | null>(null);
  // Held here, not read off the mutation: a retry clears the mutation's error
  // mid-attempt (#415). Message and outcome travel together, so a ledger never
  // outlives the failure it reports on (#416).
  const [news, setNews] = useState<RemovalNews | null>(null);
  const [justRemoved, setJustRemoved] = useState(false);
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

  // Behind names with no matching deployed skill — surfaced, never dropped.
  const orphans = drift.orphanBehind(
    primitives.map((primitive) => primitive.name),
  );

  return (
    <section className="mt-section">
      <h3
        ref={headingRef}
        tabIndex={-1}
        className="m-0 mb-inline font-normal text-gray-11 text-meta focus-visible:outline-2 focus-visible:outline-blue-9 focus-visible:outline-offset-2"
      >
        Selected skills{" "}
        <span className="text-gray-12 tabular-nums">{primitives.length}</span>
      </h3>
      <ul className="m-0 list-none border-gray-6 border-t p-0">
        {primitives.map((primitive) => {
          const status = drift.skillStatus(primitive.name);
          const latest = drift.latest(primitive.name);
          return (
            <li
              key={primitive.name}
              className="flex h-row items-center gap-inline border-gray-6 border-b text-row"
            >
              <Mark mark={skillMark(primitive.copy, status)} />
              <span className="min-w-0 flex-1 truncate text-gray-12">
                {primitive.name}
              </span>
              <span className="text-gray-11">
                <MachineValue>
                  {lagsPin(status) && latest
                    ? `${primitive.version} → ${latest}`
                    : primitive.version}
                </MachineValue>
              </span>
              <ActionsMenu
                label={`Actions for ${primitive.name}`}
                trigger={
                  <button
                    type="button"
                    className={cn(
                      // 24×24, the pointer floor (WCAG 2.2 SC 2.5.8).
                      "inline-flex size-6 cursor-pointer items-center justify-center rounded-control text-gray-11 hover:bg-gray-4 hover:text-gray-12",
                      "focus-visible:outline-2 focus-visible:outline-blue-9 focus-visible:outline-offset-2",
                    )}
                  >
                    <EllipsisVertical
                      aria-hidden="true"
                      strokeWidth={1.5}
                      className="size-4"
                    />
                  </button>
                }
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
            </li>
          );
        })}
      </ul>
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
                  // The server re-priced and acted on nothing. Its answer
                  // replaces the one on screen whole, so no confirm pairs one
                  // attempt's price with another's consent (#364).
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
                  // The row this names is gone by the time the toast is read,
                  // which is why the success travels apart from the table.
                  showSuccess(
                    removalAnnouncement({
                      name: data.removed.name,
                      version: data.removed.version,
                      // No scope in the response falls back to what the user
                      // consented to, never a guess at a different target.
                      target:
                        scope?.kind === "global"
                          ? { kind: "global", tools: scope.tools }
                          : target.kind === "global"
                            ? target
                            : { kind: "repo", name: targetName },
                    }),
                  );
                  setRemoving(null);
                  setJustRemoved(true);
                },
              },
            )
          }
        />
      ) : null}
      {orphans.length > 0 && (
        <p className="mt-inline text-amber-12 text-meta">
          Reported behind, not deployed here: {orphans.join(", ")}
        </p>
      )}
    </section>
  );
}
