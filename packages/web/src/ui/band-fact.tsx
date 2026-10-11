import type { GitHubPage } from "@maestro/core";
import { cn } from "./cn";
import { GitHubFactLink } from "./github-fact-link";

export type BandFactProps = {
  label: string;
  value: string;
  /** Links the value to its GitHub page. */
  github?: GitHubPage;
  /** False for a plain word such as Not released yet, which Geist Mono never sets. */
  machine: boolean;
};

// A label beside its value on one line, inside band 2's own <dl>.
export function BandFact({ label, value, github, machine }: BandFactProps) {
  return (
    <div className="flex min-w-0 gap-inline">
      <dt className="flex-none text-gray-11">{label}</dt>
      <dd
        title={value}
        className={cn("m-0 truncate text-gray-12", machine && "font-mono")}
      >
        <GitHubFactLink page={github} value={value} />
      </dd>
    </div>
  );
}
