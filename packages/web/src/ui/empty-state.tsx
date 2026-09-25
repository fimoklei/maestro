// Adapted from Spectrum UI (Apache-2.0)
import type { ReactNode } from "react";

export interface EmptyStateProps {
  /** `No {things} yet`. */
  title: string;
  /** One sentence saying what appears here. */
  description: string;
  /** The heading's rank in the screen's outline. */
  headingLevel: 2 | 3;
  /** A 16px Lucide icon; decorative. */
  icon?: ReactNode;
  /** The screen's primary action, repeated where the reader is looking. */
  action?: ReactNode;
}

export function EmptyState({
  title,
  description,
  headingLevel,
  icon,
  action,
}: EmptyStateProps) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <div className="flex flex-col items-center gap-inline px-panel py-page text-center">
      {icon ? (
        <div
          aria-hidden="true"
          className="mb-inline grid size-8 place-items-center rounded-control border border-gray-7 bg-gray-2 text-gray-11"
        >
          {icon}
        </div>
      ) : null}
      <Heading className="m-0 font-semibold font-ui text-gray-12 text-heading tracking-heading">
        {title}
      </Heading>
      <p className="m-0 max-w-[46ch] font-ui text-gray-11 text-prose">
        {description}
      </p>
      {action ? <div className="mt-inline">{action}</div> : null}
    </div>
  );
}
