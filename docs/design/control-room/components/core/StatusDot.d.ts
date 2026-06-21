/**
 * 6px sync-state dot used next to targets in lists and sidebars.
 */
export interface StatusDotProps {
  /** "ok" = green (in sync), "drift" = amber (has drift). Default "ok". */
  status?: "ok" | "drift";
  /** Diameter in px. Default 6. */
  size?: number;
  style?: React.CSSProperties;
}
