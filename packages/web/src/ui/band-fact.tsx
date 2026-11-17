import type { GitHubPage } from "@maestro/core";
import type { ReactNode } from "react";
import { cn } from "./cn";
import { GitHubFactLink } from "./github-fact-link";

export type BandFactProps = {
  label: string;
  value: string;
  /** A decorative 16px icon before the label. */
  icon: ReactNode;
  /** Links the value to its GitHub page. */
  github?: GitHubPage;
  /** False for a plain word such as Not released yet, which Geist Mono never sets. */
  machine: boolean;
  /** Keeps the label for screen readers only, on a narrow band. */
  labelHidden: boolean;
};

// A label beside its value on one line, inside band 2's own <dl>.
export function BandFact({
  label,
  value,
  icon,
  github,
  machine,
  labelHidden,
}: BandFactProps) {
  return (
    <div className="flex min-w-0 gap-inline">
      <dt className="flex flex-none items-center gap-tight text-gray-11">
        {icon}
        {labelHidden ? <span className="sr-only">{label}</span> : label}
      </dt>
      <dd
        title={value}
        className={cn("m-0 truncate text-gray-12", machine && "font-mono")}
      >
        <GitHubFactLink page={github} value={value} />
      </dd>
    </div>
  );
}
