/**
 * Mono-typeset action button for the Maestro cockpit.
 */
export interface ButtonProps {
  /** Visual variant. "primary" = amber fill (main action per view); "success" = green fill (confirm deploy); "ghost" = amber outline (row-level action like "deploy →"); "quiet" = grey outline; "dashed" = additive action like "+ register repo". Default "primary". */
  variant?: "primary" | "success" | "ghost" | "quiet" | "dashed";
  /** "sm" = inline row action (e.g. "update"); "md" = default; "lg" = full-width panel CTA. Default "md". */
  size?: "sm" | "md" | "lg";
  /** Button label — lowercase mono copy, e.g. "deploy →", "+ new primitive". */
  children?: React.ReactNode;
  style?: React.CSSProperties;
  onClick?: (e: React.MouseEvent) => void;
}
