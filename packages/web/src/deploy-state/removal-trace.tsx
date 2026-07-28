import { type RemovedSkill, removalAnnouncement } from "./removal-announcement";

// What a card says about the removals it has seen. A removal deletes files and
// then takes its own row off the screen, so absence is the only thing left to
// read — this is the trace that makes the outcome inspectable instead of
// inferred, in the shape the deploy path already confirms itself.
//
// The region is rendered even while empty: a live region created together with
// its first message announces unreliably across screen readers. `role="status"`
// speaks it without pulling focus, and the ✓ carries the signal where the green
// cannot.
// One entry in the trace. The id names the event, not the skill: removing a
// skill, redeploying it and removing it again writes two lines that are
// identical in every other field.
export type TracedRemoval = RemovedSkill & { id: number };

export function RemovalTrace({ removed }: { removed: TracedRemoval[] }) {
  return (
    <ul role="status">
      {removed.map((entry) => (
        <li
          key={entry.id}
          className="flex items-start gap-1.5 px-card-x py-row-y font-mono text-green-ink text-tag"
        >
          <span aria-hidden="true">✓</span>
          <span className="break-all">{removalAnnouncement(entry)}</span>
        </li>
      ))}
    </ul>
  );
}
