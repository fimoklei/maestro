import { type ReactNode, useRef } from "react";
import { BandFact, type BandFactProps } from "./band-fact";
import { cn } from "./cn";
import { STATUS_TOKENS } from "./status-family";
import { useWidthRem } from "./use-width-rem";

/** Drops the fact while band 2 is narrower than `belowRem`; rank 1 drops first. */
export type DropRule = { rank: 1 | 2 | 3; belowRem: number };

export type BandFactItem = BandFactProps & {
  /** None: the fact never drops. */
  drop?: DropRule;
};

/** Band 2's left side: the facts in order, then Read, which never drops. */
export type Band = {
  facts: readonly BandFactItem[];
  /** The freshness line; `attention` marks it amber. */
  read: { sentence: string; attention: boolean };
};

// A fact also drops while any fact of its rank or higher has dropped, so the
// order holds whatever the widths say.
const dropped = (
  fact: BandFactItem,
  facts: readonly BandFactItem[],
  width: number | null,
) =>
  width !== null &&
  fact.drop !== undefined &&
  facts.some(
    (other) =>
      other.drop !== undefined &&
      fact.drop !== undefined &&
      other.drop.rank >= fact.drop.rank &&
      width < other.drop.belowRem,
  );

/** Band 2: facts and Read on the left, the screen's controls on the right. */
export function BandRow({
  band,
  lead,
  children,
}: {
  band: Band | undefined;
  /** In place of the facts and Read on a screen without a band. */
  lead: ReactNode;
  /** The controls, right-aligned. */
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // The band's own width, not the window's: the sidebar takes its share.
  const width = useWidthRem(ref, (element) => element);
  return (
    // One tree with or without a band, so Re-read keeps its focus.
    <div ref={ref} className="flex min-w-0 flex-1 items-center gap-panel">
      {band === undefined ? (
        lead
      ) : (
        <>
          {/* Hidden once empty, so it takes no gap before Read. */}
          <dl className="m-0 flex min-w-0 items-center gap-panel text-row empty:hidden">
            {band.facts
              .filter((fact) => !dropped(fact, band.facts, width))
              .map(({ drop: _drop, ...fact }) => (
                <BandFact key={fact.label} {...fact} />
              ))}
          </dl>
          <span
            className={cn(
              "flex-none whitespace-nowrap text-meta",
              band.read.attention
                ? STATUS_TOKENS.attention.ink
                : "text-gray-11",
            )}
          >
            {band.read.sentence}
          </span>
        </>
      )}
      {children}
    </div>
  );
}
