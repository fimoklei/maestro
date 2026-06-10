import { useState } from "react";
import type { RegisteredRepo } from "../registry/use-registry";
import { useDeploySkill } from "./use-deploy-skill";

// The deploy action on a skill row: pick a registered repo, deploy with one
// click. The chosen repo is UI-state (useState); the deploy itself is a
// server-state mutation that refreshes the repo's deploy-state panel.
type DeploySkillActionProps = {
  skillName: string;
  repos: RegisteredRepo[];
};

export function DeploySkillAction({
  skillName,
  repos,
}: DeploySkillActionProps) {
  // The user's explicit pick, or null until they choose. The effective
  // selection is derived below so a pick made before the registry loaded — or
  // none yet — falls back to the first available repo instead of freezing on
  // an empty value (which left the deploy button stuck disabled).
  const [chosen, setChosen] = useState<string | null>(null);
  const deploy = useDeploySkill();

  const repoPath =
    chosen !== null && repos.some((repo) => repo.path === chosen)
      ? chosen
      : (repos[0]?.path ?? "");

  const selectId = `deploy-${skillName}-repo`;

  return (
    <span>
      <label htmlFor={selectId}>Deploy {skillName} to</label>
      <select
        id={selectId}
        value={repoPath}
        onChange={(event) => setChosen(event.target.value)}
      >
        {repos.map((repo) => (
          <option key={repo.path} value={repo.path}>
            {repo.path}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={repoPath === "" || deploy.isPending}
        onClick={() =>
          deploy.mutate({ type: "skill", name: skillName, repoPath })
        }
      >
        {deploy.isPending ? "Deploying…" : "Deploy"}
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
