import type { RegisteredRepo } from "../registry/use-registry";
import { TypeTag } from "../ui/type-tag";
import { DeploySkillAction } from "./deploy-skill-action";
import type { Primitive } from "./use-inventory";

// Presentational list of central skills as Control Room rows: a per-primitive
// TypeTag, the mono name, a dim description, and the row's deploy action. The
// view stays type-aware (TypeTag carries the type) though only skills render
// today. Empty state is explicit so a correctly configured but empty inventory
// never shows a bare, ambiguous blank.
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
    return (
      <p className="px-card-x py-row-y text-dim text-tag">
        No skills found in the inventory.
      </p>
    );
  }

  return (
    <ul className="list-none py-1.5">
      {primitives.map((primitive) => (
        <li
          key={primitive.name}
          className="flex items-center gap-3 px-card-x py-row-y"
        >
          <TypeTag type={primitive.type} />
          <span className="truncate font-mono text-data text-fg">
            {primitive.name}
          </span>
          <span className="flex-1 truncate text-desc text-muted">
            {primitive.description}
          </span>
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
