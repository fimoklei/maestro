import { RegisterRepoHint } from "../registry/register-repo-hint";
import type { RegisteredRepo } from "../registry/use-registry";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { TypeTag } from "../ui/type-tag";
import { DeploySkillAction } from "./deploy-skill-action";
import type { Primitive } from "./use-inventory";

// Presentational table of central skills: type, name, description, and an
// actions cell with the row's deploy control (#285). The view stays
// type-aware (TypeTag carries the type) though only skills render today.
// Empty state is explicit so a correctly configured but empty inventory
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
    <>
      {/* Every row's target picker offers Global and nothing else until a repo
          is registered, so say once — above the table, not per row — where repo
          targets come from. Gated on registryReady: an unread registry looks
          identical to an empty one (#37), and claiming "none registered"
          before it resolves would be a guess. */}
      {registryReady && repos.length === 0 ? (
        <RegisterRepoHint className="block px-card-x pt-row-y" />
      ) : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Type</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Description</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {primitives.map((primitive) => (
            <TableRow key={primitive.name}>
              <TableCell>
                <TypeTag type={primitive.type} />
              </TableCell>
              <TableCell className="truncate font-mono text-data text-fg">
                {primitive.name}
              </TableCell>
              <TableCell className="truncate text-desc text-muted">
                {primitive.description}
              </TableCell>
              <TableCell>
                <DeploySkillAction
                  skillName={primitive.name}
                  repos={repos}
                  registryReady={registryReady}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
}
