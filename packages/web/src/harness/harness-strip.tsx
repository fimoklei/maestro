import type { ReactNode } from "react";
import { Card } from "../ui/card";
import { Fact } from "../ui/fact";

// The repository strip: the few facts a release depends on, plus the actions
// that act on the whole repository. Presentational — the view owns the data.
export interface HarnessStripProps {
  releasedVersion: string | null;
  defaultBranch: string | null;
  status: string;
  /** Right-hand actions — Retry check, and no others. Create a release moved
   * to the panel's band 1 (#991). */
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
        {/* A definition list, so each label reads as the name of the value
            under it rather than as decoration announced on its own. */}
        <dl className="m-0 flex flex-wrap items-end gap-x-10 gap-y-4">
          <Fact label="Released" value={releasedVersion ?? "None yet"} />
          <Fact label="Branch" value={defaultBranch ?? "Unknown"} />
          <Fact label="Status" value={status} />
        </dl>
        <div className="ml-auto flex items-center gap-2">{children}</div>
      </div>
    </Card>
  );
}
