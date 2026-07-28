import { type RemovedSkill, removalAnnouncement } from "./removal-announcement";

// One entry in the trace. The id names the event, not the skill: removing a
// skill, redeploying it and removing it again writes two lines that are
// identical in every other field.
export type TracedRemoval = RemovedSkill & { id: number };

function TraceLine({ entry }: { entry: TracedRemoval }) {
  return (
    <li className="flex items-start gap-1.5 px-card-x py-row-y font-mono text-green-ink text-tag">
      {/* The ✓ carries the signal where the green cannot. */}
      <span aria-hidden="true">✓</span>
      <span className="break-all">{removalAnnouncement(entry)}</span>
    </li>
  );
}

// What a card says about the removals it has seen. A removal deletes files and
// then takes its own row off the screen, so absence is the only thing left to
// read — this is the trace that makes the outcome inspectable instead of
// inferred, in the shape the deploy path already confirms itself.
//
// Only the latest line sits in the live region, and the region itself is a fixed
// wrapper the earlier lines move out of. `role="status"` is atomic: a region
// holding the whole history would re-read every earlier removal on each new one.
// The wrapper renders even while empty, because a live region created together
// with its first message announces unreliably across screen readers.
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
