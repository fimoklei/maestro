import { MachineValue } from "../ui/machine-value";
import { StatusBadge } from "../ui/status-badge";
import {
  deployedToLine,
  moreTargetsLine,
  SOME_TARGETS_NOT_READ,
} from "./inventory-copy";
import type { SkillDeployment } from "./skill-deployments";
import { targetReading } from "./skill-status";

// The row's hover card: the Status and Targets cells expanded. It never holds
// the only copy — the detail pane lists every target (#992).
const SHOWN = 3;

export function ReachCard({
  count,
  deployments,
  unreadable,
}: {
  /** The Targets number, so the card and the column never disagree. */
  count: number;
  deployments: SkillDeployment[];
  unreadable: boolean;
}) {
  const more = deployments.length - SHOWN;
  return (
    <>
      <p className="m-0 text-gray-11">{deployedToLine(count)}</p>
      {deployments.length > 0 ? (
        <ul className="m-0 mt-inline list-none p-0">
          {deployments.slice(0, SHOWN).map((deployment) => (
            <TargetReadingRow key={deployment.label} deployment={deployment} />
          ))}
        </ul>
      ) : null}
      {more > 0 ? (
        <p className="m-0 mt-inline text-gray-11">
          {moreTargetsLine(more, deployments.length)}
        </p>
      ) : null}
      {unreadable ? (
        <p className="m-0 mt-inline text-gray-11">{SOME_TARGETS_NOT_READ}</p>
      ) : null}
    </>
  );
}

// One target: its name, the release it follows, its own reading. Shared with
// the detail pane, so the two never read a target differently.
export function TargetReadingRow({
  deployment,
}: {
  deployment: SkillDeployment;
}) {
  const reading = targetReading(deployment.status);
  return (
    <li className="flex h-row items-center gap-inline">
      <span className="min-w-0 flex-1 truncate text-gray-12">
        {deployment.label}
      </span>
      <MachineValue>{deployment.release}</MachineValue>
      {reading ? <StatusBadge reading={reading} /> : null}
    </li>
  );
}
