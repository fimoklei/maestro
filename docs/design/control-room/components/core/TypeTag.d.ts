/**
 * Uppercase mono tag identifying a primitive's type. One fixed color per type.
 */
export interface TypeTagProps {
  /** Primitive type — skill (blue), hook (purple), mcp (teal), bundle (amber). Default "skill". */
  type?: "skill" | "hook" | "mcp" | "bundle";
  style?: React.CSSProperties;
}
