import { cn } from "./cn";

// A label over the value it names, inside the caller's own <dl>. One owner:
// three panels drew the same cell and only one of them wrapped a full hash.
export function Fact({
  label,
  value,
  wrap = false,
}: {
  label: string;
  value: string;
  /** For a value with no break in it — a full commit or tree hash. */
  wrap?: boolean;
}) {
  return (
    <div className="m-0 flex min-w-0 flex-col">
      <dt className="m-label mb-1.5">{label}</dt>
      <dd
        className={cn("m-0 font-mono text-data text-fg", wrap && "break-all")}
      >
        {value}
      </dd>
    </div>
  );
}
