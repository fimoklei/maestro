import type { Ref } from "react";
import { FOCUS_RING } from "./focus-ring";

// A pane sub-list's heading, with its row count (#1458).
export function SubListHeading({
  label,
  count,
  headingRef,
}: {
  label: string;
  /** Null while the rows are not all read: a partial count would mislead. */
  count: number | null;
  /** Where the owner sends focus once a removed row is gone. */
  headingRef?: Ref<HTMLHeadingElement>;
}) {
  return (
    <h3
      ref={headingRef}
      tabIndex={-1}
      className={`m-0 mb-inline font-normal text-gray-11 text-meta ${FOCUS_RING}`}
    >
      {label}
      {count === null ? null : (
        <>
          {" "}
          <span className="text-gray-12 tabular-nums">{count}</span>
        </>
      )}
    </h3>
  );
}
