/** A section heading's words and its count, the count set apart in gray 12. */
export function CountedLabel({
  label,
  count,
}: {
  label: string;
  /** Null where a count would mislead: rows not all read, or none to count. */
  count: number | null;
}) {
  return (
    <>
      {label}
      {count === null ? null : (
        <>
          {" "}
          <span className="text-gray-12 tabular-nums">{count}</span>
        </>
      )}
    </>
  );
}
