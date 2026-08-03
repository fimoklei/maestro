import { Card } from "../ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import type { PendingSkillMovement, SkillMovementKind } from "./use-harness";

// The team delta waiting for a release: what moved, and who moved it. One
// section per kind of movement, in the order an author reads them (ADR-0021).
const SECTIONS: { kind: SkillMovementKind; label: string }[] = [
  { kind: "added", label: "Added" },
  { kind: "changed", label: "Changed" },
  { kind: "renamed", label: "Renamed" },
  { kind: "removed", label: "Removed" },
];

export interface PendingReleaseProps {
  movements: PendingSkillMovement[];
}

export function PendingRelease({ movements }: PendingReleaseProps) {
  if (movements.length === 0) {
    return null;
  }

  return (
    <section className="mt-3">
      <h3 className="m-label mb-2">Pending release</h3>
      {SECTIONS.map(({ kind, label }) => {
        const inSection = movements.filter(
          (movement) => movement.kind === kind,
        );
        // An empty section says nothing, so it is not drawn at all.
        return inSection.length === 0 ? null : (
          <Card key={kind} className="mb-3 last:mb-0">
            <Table>
              <TableHeader>
                <TableRow>
                  {/* Fixed split, so Author sits in one column down the whole
                      screen rather than shifting per section. */}
                  <TableHead className="w-2/3">{label}</TableHead>
                  <TableHead>Author</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inSection.map((movement) => (
                  <TableRow key={movement.name}>
                    <TableCell className="font-mono text-data text-fg">
                      {movement.previousName === undefined
                        ? movement.name
                        : `${movement.previousName} → ${movement.name}`}
                    </TableCell>
                    <TableCell className="text-desc text-muted">
                      {movement.author ?? "unknown"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        );
      })}
    </section>
  );
}
