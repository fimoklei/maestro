import type { GitHubPage } from "@maestro/core";
import type { DataTableColumn } from "./data-table";
import { GITHUB_COLUMN, originNotRead } from "./github-link-copy";
import { GitHubMarkLink } from "./github-mark-link";
import { StatusBadge } from "./status-badge";
import { reading } from "./status-reading";

const GITHUB_UNKNOWN = reading("Unknown", "unknown");

/**
 * A table's GitHub column: the row's own page, or its own Unknown badge where
 * the origin was not read, recovered by `screen`'s Re-read.
 */
export function githubColumn<T extends { name: string; github?: GitHubPage }>(
  screen: string,
): DataTableColumn<T> {
  return {
    id: "github",
    header: GITHUB_COLUMN,
    cell: ({ row }) =>
      row.original.github?.kind === "unknown" ? (
        <StatusBadge reading={GITHUB_UNKNOWN} />
      ) : (
        <GitHubMarkLink page={row.original.github} name={row.original.name} />
      ),
    // Drops out first on a narrow panel; the ⋮ menu keeps the same link.
    meta: { width: 28, priority: 1 },
    // Pointer only: the keyboard's Status card carries the same cause.
    card: {
      keyboard: false,
      content: (row) =>
        row.github?.kind === "unknown"
          ? { body: [originNotRead(screen)], readAge: null }
          : null,
    },
  };
}
