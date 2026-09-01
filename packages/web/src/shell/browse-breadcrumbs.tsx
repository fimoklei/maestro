import { HOVER_TRANSITION } from "../ui/hover-transition";
import type { BrowseCrumb } from "./use-browse-filesystem";

// Last segment is a marked, unclickable pill; every ancestor navigates.
// Segment paths come straight from the server — no path math here (#146).
type BrowseBreadcrumbsProps = {
  crumbs: BrowseCrumb[];
  onNavigate: (path: string) => void;
};

export function BrowseBreadcrumbs({
  crumbs,
  onNavigate,
}: BrowseBreadcrumbsProps) {
  return (
    <nav
      aria-label="Folder path"
      className="flex min-w-0 flex-wrap items-center gap-1 font-mono text-mono-sm"
    >
      {crumbs.map((crumb, index) => {
        const isCurrent = index === crumbs.length - 1;
        return (
          <span key={crumb.path} className="flex min-w-0 items-center gap-1">
            {index > 0 ? <span className="text-chip text-dim">/</span> : null}
            {isCurrent ? (
              <span
                aria-current="location"
                className="truncate rounded-tag border border-line-chip bg-active px-1.5 py-0.5 text-fg"
              >
                {crumb.name}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onNavigate(crumb.path)}
                className={`cursor-pointer truncate rounded-tag border border-transparent px-1.5 py-0.5 text-amber-ink hover:border-line-chip hover:bg-inset ${HOVER_TRANSITION}`}
              >
                {crumb.name}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}
