import { type RemovedSkill, removalAnnouncement } from "./removal-announcement";

// id names the event, not the skill: remove/redeploy/remove writes two
// otherwise-identical lines.
export type TracedRemoval = RemovedSkill & { id: number };

function TraceLine({ entry }: { entry: TracedRemoval }) {
  return (
    <li className="flex items-start gap-1.5 px-card-x py-row-y font-mono text-green-ink text-tag">
      <span aria-hidden="true">✓</span>
      <span className="break-all">{removalAnnouncement(entry)}</span>
    </li>
  );
}

// Only the latest line sits in the live region — role="status" is atomic, so
// the whole history would re-read on every removal. Renders even while empty:
// a region born with its first message announces unreliably.
export function RemovalTrace({ removed }: { removed: TracedRemoval[] }) {
  const latest = removed[removed.length - 1];
  const earlier = removed.slice(0, -1);

  return (
    <>
      {earlier.length > 0 ? (
        <ul>
          {earlier.map((entry) => (
            <TraceLine key={entry.id} entry={entry} />
          ))}
        </ul>
      ) : null}
      <div role="status">
        {latest ? (
          <ul>
            <TraceLine entry={latest} />
          </ul>
        ) : null}
      </div>
    </>
  );
}
