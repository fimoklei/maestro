import type { RegisteredRepo } from "../registry/use-registry";
import { DeploySkillAction } from "./deploy-skill-action";
import type { Primitive } from "./use-inventory";

// Presentational list of central skills, each row carrying its deploy action.
// Empty state is explicit so a correctly configured but empty inventory never
// shows a bare, ambiguous blank.
export function InventoryList({
  primitives,
  repos,
  registryReady,
}: {
  primitives: Primitive[];
  repos: RegisteredRepo[];
  registryReady: boolean;
}) {
  if (primitives.length === 0) {
    return <p>No skills found in the inventory.</p>;
  }

  return (
    <ul>
      {primitives.map((primitive) => (
        <li key={primitive.name}>
          <strong>{primitive.name}</strong>:{" "}
          <span>{primitive.description}</span>{" "}
          <DeploySkillAction
            skillName={primitive.name}
            repos={repos}
            registryReady={registryReady}
          />
        </li>
      ))}
    </ul>
  );
}
