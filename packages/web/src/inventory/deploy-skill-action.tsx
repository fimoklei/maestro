import { useState } from "react";
import { useDeployState } from "../deploy-state/use-deploy-state";
import { useGlobalDeployState } from "../deploy-state/use-global-deploy-state";
import { driftViewModel } from "../drift/drift-view-model";
import { useDrift, useGlobalDrift } from "../drift/use-drift";
import type { RegisteredRepo } from "../registry/use-registry";
import { Button } from "../ui/button";
import { Chip } from "../ui/chip";
import { DeployRefusalNotice } from "./deploy-refusal-notice";
import { globalOptionLabel } from "./global-option-label";
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
  const syncedState = drift.syncedState(
    deployState.data?.primitives,
    skillName,
  );

  // Undefined while loading/unreadable — never gate on a tool set we can't prove.
  const globalTools = globalDeployState.data?.detectedTools;
  const globalDisabled = globalTools !== undefined && globalTools.length === 0;
  // Blocked at the effective-target level too, for the empty-registry case
  // where Global is the default pick.
  const globalUnavailable = isGlobal && globalDisabled;

  const selectId = `deploy-${skillName}-target`;

  // Lowercase mono, like every other action label (DESIGN.md §6).
  const buttonLabel = !registryReady
    ? "loading targets…"
    : deploy.isPending
      ? "deploying…"
      : "deploy →";

  return (
    // Wraps: the 320px pane clips overflow, and wider states would otherwise
    // push the control out of reach.
    <span className="flex flex-wrap items-center gap-2">
      <label htmlFor={selectId} className="sr-only">
        Deploy {skillName} to
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
        className="max-w-40 truncate rounded-control border border-line-chip bg-transparent px-2 py-[3px] font-mono text-muted text-tag"
      >
        <option value={GLOBAL_VALUE} disabled={globalDisabled}>
          {globalOptionLabel(globalTools)}
        </option>
        {repos.map((repo) => (
          <option key={repo.path} value={repo.path}>
            {repo.path}
          </option>
        ))}
      </select>
      {syncedState === "synced" ? (
        <>
          <Chip tone="ok">● already synced</Chip>
          <Button
            variant="quiet"
            size="sm"
            disabled={deploy.isPending}
            onClick={() =>
              deploy.mutate({ type: "skill", name: skillName, target })
            }
          >
            {deploy.isPending ? "deploying…" : "re-deploy"}
          </Button>
        </>
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
        <span role="status" className="text-green-ink text-tag">
          Deployed {deploy.data.deployed.name} {deploy.data.deployed.version}
        </span>
      ) : null}
      {deploy.isError ? (
        // Offers an inline confirmed reinstall instead of dead-ending (ADR-0006, #66).
        <DeployRefusalNotice
          error={deploy.error}
          reinstalling={deploy.isPending}
          onReinstall={() =>
            deploy.mutate({
              type: "skill",
              name: skillName,
              target,
              force: true,
            })
          }
        />
      ) : null}
    </span>
  );
}
