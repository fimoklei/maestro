import type {
  RemoveOutcome,
  RemoveTargetState,
  RemoveToolOutcome,
} from "@maestro/core";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { HttpError } from "../api/http";
import type { DeployTarget } from "../inventory/use-deploy-skill";
import { machine, named, namedList, type Phrase, phrase } from "../ui/phrase";
import { useScreenReport, useWriteAction } from "../ui/use-write-action";
import { type DeployStateNotice, removeNotice } from "./notice-copy";
import type { RemoveDialogTarget } from "./remove-ledger-rows";
import { removePreflightView } from "./remove-preflight-view";
import { RemoveSkillDialog } from "./remove-skill-dialog";
import { toolDisplayName } from "./tool-presentation";
import { useRemoveDeployedSkill } from "./use-remove-deployed-skill";
import {
  type RemovePreflight,
  readRemovePreflight,
  removePreflightQueryOptions,
  useRemovePreflight,
} from "./use-remove-preflight";

type RemovedSkill = {
  name: string;
  version: string | undefined;
  // As the server resolved it: the detected tool set can differ from what was
  // confirmed. A repo goes by the table's name, never its absolute path (#1119).
  target:
    | Exclude<RemoveDialogTarget, { kind: "repo" }>
    | { kind: "repo"; name: string };
};

// What a landed removal's done sentence names.
function removedName({ name, version, target }: RemovedSkill): Phrase {
  const scope =
    target.kind === "repo"
      ? named(target.name)
      : // The detected set can be empty.
        target.tools.length === 0
        ? "every detected tool"
        : namedList(target.tools.map(toolDisplayName));
  const release =
    version === undefined ? "(version unknown)" : machine(version);
  return phrase`${named(name)} ${release} from ${scope}`;
}

const STATES: Record<string, RemoveTargetState> = {
  removed: "removed",
  "not-removed": "not-removed",
  unknown: "unknown",
};

// Nothing validates this body. A report this build cannot read is dropped
// whole: a ledger built on a guess states an outcome the server never proved.
function removalOutcome(error: unknown): RemoveOutcome | null {
  if (!(error instanceof HttpError)) {
    return null;
  }
  const outcome = (error.body as { outcome?: unknown } | undefined)?.outcome as
    | { scope?: unknown; state?: unknown; tools?: unknown }
    | undefined;
  if (outcome?.scope === "repo") {
    const state = STATES[String(outcome.state)];
    return state === undefined ? null : { scope: "repo", state };
  }
  if (outcome?.scope === "global" && Array.isArray(outcome.tools)) {
    const tools: RemoveToolOutcome[] = [];
    for (const entry of outcome.tools as {
      tool?: unknown;
      state?: unknown;
    }[]) {
      const state = STATES[String(entry?.state)];
      if (state === undefined || typeof entry?.tool !== "string") {
        return null;
      }
      tools.push({ tool: entry.tool as RemoveToolOutcome["tool"], state });
    }
    return { scope: "global", tools };
  }
  return null;
}

// The question a refused removal restated (#364). All or nothing: a fresh cost
// paired with an older consent is what #364 prevents.
function restatedCost(
  error: unknown,
): (RemovePreflight & { receipt: string }) | null {
  if (!(error instanceof HttpError) || error.code !== "cost-not-acknowledged") {
    return null;
  }
  const cost = readRemovePreflight(error.body);
  return cost?.receipt === undefined
    ? null
    : { ...cost, receipt: cost.receipt };
}

// Read after a failed attempt, a clean target means that attempt landed: apm
// can remove a skill and still fail to prove it.
const alreadyGone = (error: unknown) =>
  error instanceof HttpError && error.code === "not-deployed";

type RemovalNews =
  | { kind: "failed"; notice: DeployStateNotice; outcome: RemoveOutcome | null }
  | { kind: "restated"; notice: DeployStateNotice };

const removalFailure = (error: unknown): RemovalNews => ({
  kind: "failed",
  notice: removeNotice(error),
  outcome: removalOutcome(error),
});

// One skill's removal from one target: its check, confirmation and run.
export function RemoveSkillFlow({
  skillName,
  version,
  target,
  onCancel,
  onRemoved,
}: {
  skillName: string;
  /** Null rather than a guess where the list no longer carries the skill. */
  version: string | null;
  // Required: a global target's tools must be present or the confirmation can't render.
  target: RemoveDialogTarget;
  onCancel: () => void;
  /** Called once a proven removal has closed the dialog. */
  onRemoved: () => void;
}) {
  // Held here, not read off the mutation: a retry clears the mutation's error
  // mid-attempt (#415). Message and outcome travel together (#416).
  const [news, setNews] = useState<RemovalNews | null>(null);
  const queryClient = useQueryClient();
  const remove = useRemoveDeployedSkill();
  // Global's location is apm's own, resolved server-side.
  const wireTarget: DeployTarget =
    target.kind === "repo"
      ? { kind: "repo", repoPath: target.repoPath }
      : { kind: "global" };
  const preflight = useRemovePreflight(skillName, wireTarget);
  const removeWrite = useWriteAction(remove, {
    report: useScreenReport(),
    action: "remove",
    show: "toast",
    name: ({ removed }) =>
      removedName({
        name: removed.name,
        version: removed.version,
        // No scope in the response falls back to what the user consented to.
        target:
          removed.scope?.kind === "global"
            ? { kind: "global", tools: removed.scope.tools }
            : target.kind === "global"
              ? target
              : { kind: "repo", name: target.name },
      }),
    // `news` states it: a retry clears the mutation's error mid-attempt.
    failure: () => null,
  });

  return (
    <RemoveSkillDialog
      skillName={skillName}
      version={version}
      target={target}
      isRemoving={removeWrite.phase === "running"}
      preflight={removePreflightView(preflight)}
      error={news?.kind === "failed" ? news.notice : null}
      restated={news?.kind === "restated" ? news.notice : null}
      outcome={news?.kind === "failed" ? news.outcome : null}
      onCancel={onCancel}
      onConfirm={() =>
        removeWrite.run(
          {
            type: "skill",
            name: skillName,
            target: wireTarget,
            confirmedReclaimToken: preflight.data?.reclaim?.token,
            confirmedRemovalReceipt: preflight.data?.receipt,
          },
          {
            onError: (error) => {
              if (news?.kind === "failed" && alreadyGone(error)) {
                onRemoved();
                return;
              }
              // The server acted on nothing; its answer replaces the one on screen whole, so no
              // confirm pairs one attempt's price with another's consent (#364).
              const cost = restatedCost(error);
              if (cost !== null) {
                queryClient.setQueryData(
                  removePreflightQueryOptions(skillName, wireTarget).queryKey,
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
            onSuccess: () => {
              onRemoved();
            },
          },
        )
      }
    />
  );
}
