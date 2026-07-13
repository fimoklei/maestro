import { useState } from "react";
import { useDeployState } from "../deploy-state/use-deploy-state";
import { useGlobalDeployState } from "../deploy-state/use-global-deploy-state";
import { deriveSyncedState } from "../drift/derive-synced-state";
import { toDriftView } from "../drift/drift-query-view";
import { useDrift, useGlobalDrift } from "../drift/use-drift";
import type { RegisteredRepo } from "../registry/use-registry";
import { Button } from "../ui/button";
import { Chip } from "../ui/chip";
import { DeployRefusalNotice } from "./deploy-refusal-notice";
import { type DeployTarget, useDeploySkill } from "./use-deploy-skill";

// The deploy action on a skill row: pick a target — "Global" or a registered
// repo — and deploy with one click. The chosen target is UI-state (useState);
// the deploy itself is a server-state mutation that refreshes the matching
// deploy-state panel.
type DeploySkillActionProps = {
  skillName: string;
  repos: RegisteredRepo[];
  // False while the registry query is pending or failed. An unloaded registry
  // yields the same empty repos list as a genuinely empty one, and the empty
  // fallback selects Global — so deploying must wait until this is true.
  registryReady: boolean;
};

// The select value for the global target. A repo's value is its path, which is
// always absolute, so it can never collide with this literal.
const GLOBAL_VALUE = "global";

export function DeploySkillAction({
  skillName,
  repos,
  registryReady,
}: DeploySkillActionProps) {
  // The user's explicit pick, or null until they choose. The effective
  // selection is derived below: an unknown pick falls back to the first repo,
  // or to Global when the loaded registry has no repos (Global needs no repo).
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
  const globalDeployState = useGlobalDeployState(registryReady && isGlobal);
  const repoDrift = useDrift(
    isGlobal ? "" : target.repoPath,
    registryReady && !isGlobal,
  );
  const globalDrift = useGlobalDrift(registryReady && isGlobal);
  const deployState = isGlobal ? globalDeployState : repoDeployState;
  const drift = isGlobal ? globalDrift : repoDrift;
  const syncedState = deriveSyncedState(
    deployState.data?.primitives,
    toDriftView(drift),
    skillName,
  );

  const selectId = `deploy-${skillName}-target`;

  const buttonLabel = !registryReady
    ? "Loading targets…"
    : deploy.isPending
      ? "Deploying…"
      : "Deploy →";

  return (
    <span className="flex items-center gap-2">
      <label htmlFor={selectId} className="sr-only">
        Deploy {skillName} to
      </label>
      <select
        id={selectId}
        value={selected}
        onChange={(event) => {
          // Picking a different target discards the previous deploy outcome, so
          // a forced reinstall can never carry over to a target whose own
          // not-proven-clean refusal was never shown (#66).
          deploy.reset();
          setChosen(event.target.value);
        }}
        className="max-w-40 truncate rounded-control border border-line-chip bg-transparent px-2 py-[3px] font-mono text-muted text-tag"
      >
        <option value={GLOBAL_VALUE}>Global</option>
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
            {deploy.isPending ? "Deploying…" : "Re-deploy"}
          </Button>
        </>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          disabled={!registryReady || deploy.isPending}
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
        // The server's message is actionable; a not-proven-clean deployed copy
        // additionally offers an inline confirmed reinstall (force) instead of
        // dead-ending the user (ADR-0006, #66).
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
