import { Chip } from "../ui/chip";
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
                <TypeTag />
              </TableCell>
              <TableCell title={movement.skill} className="text-data">
                {/* Name truncates, the chip stays: a long name must not clip
                    the one label this read carries — a deletion, the only
                    movement named today; additions and edits stay bare (#575). */}
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-mono text-fg">
                    {movement.skill}
                  </span>
                  {movement.deletion ? (
                    <Chip tone="drift" className="shrink-0">
                      deleted locally
                    </Chip>
                  ) : null}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
