/**
 * Sidebar navigation item with a unicode glyph icon. Active = raised surface + amber glyph.
 */
export interface NavItemProps {
  /** Unicode glyph, e.g. "▤" inventory, "⇶" deploy-state, "⧉" compose. */
  icon?: React.ReactNode;
  /** View name in sentence case, e.g. "Deploy-state". */
  label: React.ReactNode;
  /** Active view. Default false. */
  active?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  style?: React.CSSProperties;
}
