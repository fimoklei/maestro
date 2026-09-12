import { useRef } from "react";
import { driftViewModel } from "../drift/drift-view-model";
import { useDrift } from "../drift/use-drift";
import { targetLabel } from "../shell/target-label";
import { Card } from "../ui/card";
import { Notice } from "../ui/notice";
import { DeployStateList } from "./deploy-state-list";
import { toDeployedView } from "./deployed-view";
import { PinnedPerSkillHead } from "./pinned-per-skill-head";
import { releaseLabel } from "./release-head-copy";
import { ReleaseHeadMeta } from "./release-head-meta";
import { TargetDeployAction } from "./target-deploy-action";
import { TargetStatusChip } from "./target-status-chip";
import { UnfinishedOperationHead } from "./unfinished-operation-head";
import { UpdateTargetAction } from "./update-target-action";
import { UpdatingLine } from "./updating-line";
import { useDeployState } from "./use-deploy-state";
import { useRetryOperation } from "./use-retry-operation";
import { useUpdateTarget } from "./use-update-target";

// One repo's target card. Deploy-state and drift are separate queries: the
// skill list renders first, each drift badge fills in later. A failed read
// gets a visible error — never an empty list standing in for it.
export function DeployStatePanel({
  repo,
  siblings = [],
  onStartDeploy,
}: {
  repo: string;
  // Every registered repo path, so the label grows only far enough to stay
  // distinct from the others (#211). Empty when rendered in isolation.
  siblings?: string[];
  onStartDeploy: () => void;
}) {
  const deployState = useDeployState(repo);
  const drift = driftViewModel(useDrift(repo));
  const indicator = drift.targetIndicator(toDeployedView(deployState));
  const head = deployState.data?.releaseHead;
  const pinned = deployState.data?.pinnedPerSkill;
  const pending = deployState.data?.pendingOperation;
  const retry = useRetryOperation();
  const update = useUpdateTarget();
  // One control per behind target (ADR-0031). A pinned-per-skill target carries
  // no head, so none is offered there (#950); an unfinished operation outranks
  // it, because that target converges first (#951, #954).
  const behind =
    head !== undefined &&
    head.latestRelease !== null &&
    head.latestRelease !== head.release &&
    pending === undefined;
  const label = targetLabel(repo, siblings);
  // Where focus goes when a removal destroys the row it was triggered from.
  const headerRef = useRef<HTMLHeadingElement>(null);

  return (
    <Card
      title={<span title={repo}>{label}</span>}
      titleRef={headerRef}
      kind="local"
      data={head ? releaseLabel(head) : undefined}
      drift={indicator === "drift"}
      status={
        <>
          <TargetStatusChip
            indicator={indicator}
            pinnedPerSkill={pinned !== undefined}
            behind={behind}
            mixedReleases={pending?.kind === "update"}
          />
          {/* Kept mounted while the update has an answer: the dialog holds the
              outcome the reader just earned, even though the target is no
              longer offered another Update (#954). */}
          {behind || update.data !== undefined || update.isError ? (
            <UpdateTargetAction
              targetName={label}
              target={{ kind: "repo", repoPath: repo }}
              update={update}
              offered={behind}
            />
          ) : null}
        </>
      }
    >
      {deployState.isLoading ? (
        <p className="px-card-x py-row-y text-dim text-tag">
          Loading the deploy-state…
        </p>
      ) : deployState.isError ? (
        <div className="px-card-x py-row-y">
          <Notice
            trigger="load"
            notice={{
              level: "error",
              label: "Deploy-state not read",
              message:
                "Reload the page to read this repository's deploy-state again.",
            }}
          />
        </div>
      ) : update.isPending ? (
        // No control at all while apm runs, so a second operation cannot be
        // started from this card (spec story 27).
        <UpdatingLine release={head?.latestRelease ?? ""} />
      ) : indicator === "empty" && pending === undefined ? (
        <TargetDeployAction onStartDeploy={onStartDeploy} />
      ) : (
        <>
          {pending ? (
            <UnfinishedOperationHead
              pending={pending}
              primitives={deployState.data?.primitives ?? []}
              onRetry={() =>
                retry.mutate({ target: { kind: "repo", repoPath: repo } })
              }
              isRetrying={retry.isPending}
            />
          ) : null}
          {head ? <ReleaseHeadMeta head={head} /> : null}
          {pinned ? <PinnedPerSkillHead pinned={pinned} /> : null}
          <DeployStateList
            primitives={deployState.data?.primitives ?? []}
            skipped={deployState.data?.skipped ?? []}
            drift={drift}
            headRelease={head?.release}
            extraFiles={deployState.data?.extraFiles}
            target={{ kind: "repo", repoPath: repo }}
            onRemoved={() => headerRef.current?.focus()}
          />
        </>
      )}
    </Card>
  );
}
