import type { GitHubPage } from "@maestro/core";
import type { ReactNode } from "react";
import { cn } from "../ui/cn";
import { GitHubFactLink } from "../ui/github-fact-link";

// One row of a Settings section (#995): the name and at most one sentence
// left, a value or one control right. The row wraps, so the right side drops
// under the name when narrow.

export interface SettingsRowProps {
  name: string;
  /** At most one sentence. */
  description?: string;
  /** Truncated, with the whole value on hover. */
  value?: string;
  /** Links the value to its GitHub page. */
  github?: GitHubPage;
  /** False for a plain word, which Geist Mono never sets. */
  machine?: boolean;
  control?: ReactNode;
  /** An id for the name, so the control can take it as its label. */
  nameId?: string;
}

export function SettingsRow({
  name,
  nameId,
  description,
  value,
  github,
  machine = true,
  control,
}: SettingsRowProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-panel gap-y-inline border-gray-7 border-b px-panel py-cell last:border-b-0">
      <div className="flex min-w-0 grow basis-[220px] flex-col">
        <span id={nameId} className="font-medium font-ui text-gray-12 text-row">
          {name}
        </span>
        {description === undefined ? null : (
          <span className="font-ui text-gray-11 text-meta">{description}</span>
        )}
      </div>
      {value === undefined ? null : (
        <span
          title={value}
          className={cn(
            "min-w-0 truncate text-gray-11",
            machine ? "font-mono text-meta" : "font-ui text-row",
          )}
        >
          <GitHubFactLink page={github} value={value} />
        </span>
      )}
      {control}
    </div>
  );
}
