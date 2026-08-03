import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { TypeTag } from "../ui/type-tag";
import type { HarnessMovement } from "./use-harness";

// The rows of one state-named section. Type is a column even though every row
// is a skill today: Inventory already tags its type, and hooks and MCP servers
// then slot in without reshaping the table (#347).
export function MovementTable({ movements }: { movements: HarnessMovement[] }) {
  return (
    // Narrow, the columns would crush the name to nothing. The table keeps a
    // floor and the section scrolls sideways instead (#347).
    <div className="overflow-x-auto">
      <Table className="min-w-[320px] table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead className="w-20">Type</TableHead>
            <TableHead>Name</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {movements.map((movement) => (
            <TableRow key={movement.skill}>
              <TableCell>
                <TypeTag type="skill" />
              </TableCell>
              <TableCell
                title={movement.skill}
                className="truncate font-mono text-data text-fg"
              >
                {movement.skill}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
