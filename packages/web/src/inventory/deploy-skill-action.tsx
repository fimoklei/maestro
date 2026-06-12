import { useState } from "react";
import type { RegisteredRepo } from "../registry/use-registry";
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

  const selectId = `deploy-${skillName}-target`;

  const buttonLabel = !registryReady
    ? "Loading targets…"
    : deploy.isPending
      ? "Deploying…"
      : "Deploy";

  return (
    <span>
      <label htmlFor={selectId}>Deploy {skillName} to</label>
      <select
        id={selectId}
        value={selected}
        onChange={(event) => setChosen(event.target.value)}
      >
        <option value={GLOBAL_VALUE}>Global</option>
        {repos.map((repo) => (
          <option key={repo.path} value={repo.path}>
            {repo.path}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={!registryReady || deploy.isPending}
        onClick={() =>
          deploy.mutate({ type: "skill", name: skillName, target })
        }
      >
        {buttonLabel}
      </button>
      {deploy.isSuccess ? (
        <span role="status">
          Deployed {deploy.data.deployed.name} {deploy.data.deployed.version}
        </span>
      ) : null}
      {deploy.isError ? (
        // The server's message is actionable ("tag and push…"); show it
        // instead of a generic failure line.
        <span role="alert">{deploy.error.message}</span>
      ) : null}
    </span>
  );
}
