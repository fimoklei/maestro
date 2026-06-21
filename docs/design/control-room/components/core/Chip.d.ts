/**
 * Small mono status / meta capsule.
 */
export interface ChipProps {
  /** "ok" = green (in sync, healthy); "drift" = amber (version drift, attention); "dim" = grey neutral meta (version numbers, counts). Default "dim". */
  tone?: "ok" | "drift" | "dim";
  /** Chip content — prefix status chips with a glyph: "● in sync", "▲ 2 drift". */
  children?: React.ReactNode;
  style?: React.CSSProperties;
}
