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
import { UpdateTargetAction } from "./update-target-action";
import { useDeployState } from "./use-deploy-state";

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
  // One control per behind target, so one release costs one action instead of N
  // (ADR-0031). A target still pinned per skill carries no head, so none is
  // offered there — there is no mechanism to sell it (#950).
  const behind =
    head !== undefined &&
    head.latestRelease !== null &&
    head.latestRelease !== head.release;
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
          />
          {behind ? (
            <UpdateTargetAction
              targetName={label}
              target={{ kind: "repo", repoPath: repo }}
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
      ) : indicator === "empty" ? (
        <TargetDeployAction onStartDeploy={onStartDeploy} />
      ) : (
        <>
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
