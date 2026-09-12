import { useState } from "react";
import { HttpError } from "../api/http";
import { UpdateTargetAction } from "../deploy-state/update-target-action";
import { useDeployState } from "../deploy-state/use-deploy-state";
import { useGlobalDeployState } from "../deploy-state/use-global-deploy-state";
import { useUpdateTarget } from "../deploy-state/use-update-target";
import { driftViewModel } from "../drift/drift-view-model";
import { useDrift, useGlobalDrift } from "../drift/use-drift";
import { versionColor } from "../drift/version-color";
import type { RegisteredRepo } from "../registry/use-registry";
import { targetLabel } from "../shell/target-label";
import { Button } from "../ui/button";
import { cn } from "../ui/cn";
import { Notice } from "../ui/notice";
import { DeployRefusalNotice } from "./deploy-refusal-notice";
import { headsReading } from "./deployed-rollup";
import { globalOptionLabel } from "./global-option-label";
import { targetSyncLine } from "./inventory-copy";
import { type DeployTarget, useDeploySkill } from "./use-deploy-skill";

type DeploySkillActionProps = {
  skillName: string;
  repos: RegisteredRepo[];
  // False while the registry query is pending or failed — an unloaded
  // registry looks like an empty one and would default-select Global.
  registryReady: boolean;
};

// A repo's value is its absolute path, so it can never collide with this literal.
const GLOBAL_VALUE = "global";

export function DeploySkillAction({
  skillName,
  repos,
  registryReady,
}: DeploySkillActionProps) {
  const [chosen, setChosen] = useState<string | null>(null);
  const deploy = useDeploySkill();
  const update = useUpdateTarget();

  const isKnown =
    chosen === GLOBAL_VALUE || repos.some((repo) => repo.path === chosen);
  const selected = isKnown
    ? (chosen as string)
    : (repos[0]?.path ?? GLOBAL_VALUE);

  const target: DeployTarget =
    selected === GLOBAL_VALUE
      ? { kind: "global" }
      : { kind: "repo", repoPath: selected };
  const isGlobal = target.kind === "global";
  const repoDeployState = useDeployState(
    isGlobal ? "" : target.repoPath,
    registryReady && !isGlobal,
  );
  // Fetched as soon as the registry is ready, not only when Global is picked —
  // the option must name and gate itself before selection (#134).
  const globalDeployState = useGlobalDeployState(registryReady);
  const repoDrift = useDrift(
    isGlobal ? "" : target.repoPath,
    registryReady && !isGlobal,
  );
  const globalDrift = useGlobalDrift(registryReady && isGlobal);
  const deployState = isGlobal ? globalDeployState : repoDeployState;
  const drift = driftViewModel(isGlobal ? globalDrift : repoDrift);
  const deployedVersion = deployState.data?.primitives?.find(
    (primitive) => primitive.name === skillName,
  )?.version;
  // The Release head answers first: the per-skill drift check says nothing
  // about a target that follows one release, so a behind copy read as in sync
  // (ADR-0031, #956). Global carries one head per detected tool.
  const headStatus = headsReading(
    isGlobal
      ? (globalDeployState.data?.tools ?? []).map((tool) => tool.releaseHead)
      : [repoDeployState.data?.releaseHead],
    skillName,
  );
  const deployedHere = deployedVersion !== undefined;
  const syncedState =
    headStatus === undefined
      ? drift.syncedState(deployState.data?.primitives, skillName)
      : deployedHere && headStatus === "up-to-date"
        ? "synced"
        : "not-synced";
  // Deployed, but the newest release changed it: Update target moves it, and
  // redeploying at this release would change nothing.
  const behindHere = deployedHere && headStatus === "behind";

  // Undefined while loading/unreadable — never gate on a tool set we can't prove.
  const globalTools = globalDeployState.data?.detectedTools;
  const globalDisabled = globalTools !== undefined && globalTools.length === 0;
  // Blocked at the effective-target level too, for the empty-registry case
  // where Global is the default pick.
  const globalUnavailable = isGlobal && globalDisabled;

  // The deploy refused because this release does not hold the skill, and the
  // newer one may. Read from the code, never the sentence (#66, #955).
  const needsNewerRelease =
    deploy.error instanceof HttpError &&
    deploy.error.code === "not-at-target-release";

  const selectId = `deploy-${skillName}-target`;
  // Shortened like every other target name in the cockpit (#211).
  const repoPaths = repos.map((repo) => repo.path);
  // The picker's own words for the chosen target, so the dialog names it the
  // way the reader picked it.
  const targetName = isGlobal
    ? globalOptionLabel(globalTools)
    : targetLabel(selected, repoPaths);

  const buttonLabel = !registryReady
    ? "Loading targets…"
    : deploy.isPending
      ? "Deploying skill…"
      : "Deploy skill";

  return (
    // Wraps: the 320px pane clips overflow, and wider states would otherwise
    // push the control out of reach.
    <span className="flex flex-wrap items-center gap-2">
      <label htmlFor={selectId} className="sr-only">
        Deploy target for {skillName}
      </label>
      <select
        id={selectId}
        value={selected}
        onChange={(event) => {
          // Discards the previous outcome, so a forced reinstall can't carry
          // over to a target whose refusal was never shown (#66).
          deploy.reset();
          setChosen(event.target.value);
        }}
        className="max-w-64 truncate rounded-control border border-line-chip bg-transparent px-2 py-[3px] font-mono text-muted text-tag"
      >
        <option value={GLOBAL_VALUE} disabled={globalDisabled}>
          {globalOptionLabel(globalTools)}
        </option>
        {repos.map((repo) => (
          <option key={repo.path} value={repo.path}>
            {targetLabel(repo.path, repoPaths)}
          </option>
        ))}
      </select>
      {syncedState === "synced" || behindHere ? (
        /* State, not an action: *Deploy skill again* is retired, because a
           skill already on the target's release has nothing to redeploy and
           the control implied a release of its own (ADR-0031, #956). */
        <span
          className={cn(
            "basis-full font-mono text-tag",
            versionColor[behindHere ? "behind" : "up-to-date"],
          )}
        >
          {targetSyncLine(behindHere ? "behind" : "in-sync", deployedVersion)}
        </span>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          disabled={!registryReady || deploy.isPending || globalUnavailable}
          onClick={() =>
            deploy.mutate({ type: "skill", name: skillName, target })
          }
        >
          {buttonLabel}
        </Button>
      )}
      {deploy.isSuccess ? (
        <Notice
          trigger="user-action"
          notice={{
            level: "success",
            label: "Deployed",
            message: `${deploy.data.deployed.name} ${deploy.data.deployed.version} is deployed on this target.`,
          }}
        />
      ) : null}
      {deploy.isError ? (
        // Offers an inline confirmed reinstall instead of dead-ending (ADR-0006, #66).
        <DeployRefusalNotice
          error={deploy.error}
          reinstalling={deploy.isPending}
          onReinstall={(confirmedCopyReceipt) =>
            deploy.mutate({
              type: "skill",
              name: skillName,
              target,
              confirmedCopyReceipt,
            })
          }
        />
      ) : null}
      {/* Two ways into one preview: the refusal another release clears, and a
          copy the newest release changed. Both price this skill as well, so a
          Selection that already holds it simply adds nothing (#955, story 46). */}
      {needsNewerRelease || behindHere ? (
        <UpdateTargetAction
          targetName={targetName}
          target={target}
          update={update}
          add={skillName}
          // The refusal described a target this update just moved, so it goes
          // with the dialog rather than outliving what it stated.
          onClose={() => deploy.reset()}
        />
      ) : null}
    </span>
  );
}
