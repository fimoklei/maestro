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
  const [repoPath, setRepoPath] = useState(repos[0]?.path ?? "");
  const deploy = useDeploySkill();

  const selectId = `deploy-${skillName}-repo`;

  return (
    <span>
      <label htmlFor={selectId}>Deploy {skillName} to</label>
      <select
        id={selectId}
        value={repoPath}
        onChange={(event) => setRepoPath(event.target.value)}
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
      {deploy.isError ? <span role="alert">Deploy failed.</span> : null}
    </span>
  );
}
