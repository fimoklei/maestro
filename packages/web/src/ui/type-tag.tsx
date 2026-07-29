import { cn } from "./cn";

// Uppercase mono tag for a primitive's type, one fixed colour each.

export type PrimitiveType = "skill" | "hook" | "mcp" | "bundle";

export interface TypeTagProps {
  /** Primitive type — skill (blue), hook (purple), mcp (teal), bundle (amber). */
  type?: PrimitiveType;
  className?: string;
}

// Static per-type classes (Tailwind cannot scan interpolated class names).
// /27, /8 alphas mirror design.json — see .claude/rules/design.md.
const typeClasses: Record<PrimitiveType, string> = {
  skill: "text-type-skill border-type-skill/27 bg-type-skill/8",
  hook: "text-type-hook border-type-hook/27 bg-type-hook/8",
  mcp: "text-type-mcp border-type-mcp/27 bg-type-mcp/8",
  bundle: "text-type-bundle border-type-bundle/27 bg-type-bundle/8",
};

export function TypeTag({ type = "skill", className }: TypeTagProps) {
  return (
    <span
      className={cn(
        "inline-block whitespace-nowrap rounded-tag border px-1.5 py-0.5 font-mono text-tag uppercase tracking-tag",
        typeClasses[type],
        className,
      )}
    >
      {type}
    </span>
  );
}
