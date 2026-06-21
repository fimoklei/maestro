/**
 * Maestro brand mark: amber "M" tile with optional wordmark and mono context line.
 */
export interface LogoProps {
  /** Tile size in px. Default 26 (status-bar scale). */
  size?: number;
  /** Show the "Maestro" wordmark next to the tile. Default false. */
  wordmark?: boolean;
  /** Dim mono context after the wordmark, e.g. "agent-harness · main · 9 primitives". */
  context?: React.ReactNode;
  style?: React.CSSProperties;
}
