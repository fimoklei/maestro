import { cn } from "./cn";

// Uppercase mono tag identifying a primitive's type. One fixed colour per type,
// shown at low opacity for the border/fill — the cockpit's only use of the four
// reserved type colours. Type-aware across skill/hook/mcp/bundle even though
// MVP1 renders skills only, so future primitive types slot in additively.

export type PrimitiveType = "skill" | "hook" | "mcp" | "bundle";

export interface TypeTagProps {
  /** Primitive type — skill (blue), hook (purple), mcp (teal), bundle (amber). */
  type?: PrimitiveType;
  className?: string;
}

// Static per-type classes (Tailwind cannot scan interpolated class names).
// /27 border and /8 fill mirror the design source's color-mix alphas.
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
