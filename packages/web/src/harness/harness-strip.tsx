import type { ReactNode } from "react";
import { Card } from "../ui/card";

// The repository strip: the few facts a release depends on, plus the actions
// that act on the whole repository. Presentational — the view owns the data.
export interface HarnessStripProps {
  releasedVersion: string | null;
  defaultBranch: string | null;
  status: string;
  /** Right-hand actions — Refresh here, Release once that job lands. */
  children?: ReactNode;
}

export function HarnessStrip({
  releasedVersion,
  defaultBranch,
  status,
  children,
}: HarnessStripProps) {
  return (
    <Card padded>
      <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
        <Fact label="Released" value={releasedVersion ?? "none yet"} />
        <Fact label="Branch" value={defaultBranch ?? "unknown"} />
        <Fact label="Status" value={status} />
        <div className="ml-auto flex items-center gap-2">{children}</div>
      </div>
    </Card>
  );
}

// A definition list, so the label reads as the name of the value beside it
// rather than as decoration a screen reader announces on its own.
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <dl className="m-0">
      <dt className="m-label mb-1.5">{label}</dt>
      <dd className="m-0 font-mono text-data text-fg">{value}</dd>
    </dl>
  );
}
