import markUrl from "../assets/maestro-mark.svg?no-inline";
import { cn } from "./cn";

export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn("flex h-control items-center gap-inline", className)}>
      <svg
        aria-hidden="true"
        width="20"
        height="20"
        viewBox="0 0 100 100"
        fill="currentColor"
        className="shrink-0 text-gray-12"
      >
        <use href={`${markUrl}#mark`} />
      </svg>
      <span className="font-semibold font-ui text-gray-12 text-prose tracking-heading">
        Maestro
      </span>
    </div>
  );
}
