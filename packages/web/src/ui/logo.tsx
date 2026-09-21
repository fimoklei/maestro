import { cn } from "./cn";

// The product mark: a neutral 20px outline tile over the wordmark, one 32px
// row at the top of the sidebar (#991). No hue — the tile is slate 12 like the
// words beside it (ADR-0033 §2).

export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn("flex h-control items-center gap-inline", className)}>
      <svg
        aria-hidden="true"
        width="20"
        height="20"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className="shrink-0 text-gray-12"
      >
        <rect x="2.75" y="2.75" width="14.5" height="14.5" rx="4" />
        <path d="M6.5 13V7l3.5 3.5L13.5 7v6" />
      </svg>
      <span className="font-semibold font-ui text-gray-12 text-prose tracking-heading">
        Maestro
      </span>
    </div>
  );
}
