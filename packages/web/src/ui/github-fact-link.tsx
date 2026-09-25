import type { GitHubPage } from "@maestro/core";
import { factOnGitHub } from "./github-link-copy";

// A fact's value linked to its GitHub page (design.md → Frame): the value is
// the link, no mark. Plain text where there is no readable page.
export function GitHubFactLink({
  page,
  value,
}: {
  page: GitHubPage | undefined;
  value: string;
}) {
  if (page?.kind !== "link") return value;
  return (
    <a
      href={page.url}
      target="_blank"
      rel="noreferrer"
      title={value}
      aria-label={factOnGitHub(value)}
      // Inset ring: every fact slot truncates, which clips an outset one.
      className="rounded-control text-blue-11 no-underline underline-offset-2 hover:underline focus-visible:-outline-offset-2"
    >
      {value}
    </a>
  );
}
