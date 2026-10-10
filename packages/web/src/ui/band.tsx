import { type ReactNode, useRef } from "react";
import { BandFact, type BandFactProps } from "./band-fact";
import { cn } from "./cn";
import { SearchBox } from "./search-box";
import { STATUS_TOKENS } from "./status-family";
import { useWidthRem } from "./use-width-rem";

/** Drops the fact while band 2 is narrower than `belowRem`; rank 1 drops first. */
type DropRule = { rank: number; belowRem: number };

type BandFactItem = BandFactProps & {
  /** None: the fact never drops. */
  drop?: DropRule & { rank: 1 | 2 | 3 };
};

/** Band 2's search, first on the right; it narrows to 12rem, then becomes an icon last. */
type BandSearch = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Band width in rem below which the search is an icon. */
  iconBelowRem: number;
};

/** Band 2: the facts in order, then Read, which never drops; an optional search on the right. */
export type Band = {
  facts: readonly BandFactItem[];
  /** The freshness line; `attention` marks it amber. */
  read: { sentence: string; attention: boolean };
  search?: BandSearch;
};

// A rule applies while the band is narrower than it, and also while any rule of
// its rank or higher applies, so the order holds whatever the widths say. The
// search icon ranks above every fact: it comes last.
const applies = (
  rule: DropRule | undefined,
  rules: readonly DropRule[],
  width: number | null,
) =>
  width !== null &&
  rule !== undefined &&
  rules.some((other) => other.rank >= rule.rank && width < other.belowRem);

/** Band 2: facts and Read on the left; the search, then the screen's controls, on the right. */
export function BandRow({
  band,
  children,
}: {
  band: Band | undefined;
  /** The controls, after the search. */
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // The band's own width, not the window's: the sidebar takes its share.
  const width = useWidthRem(ref, (element) => element);
  const searchRule =
    band?.search === undefined
      ? undefined
      : { rank: 4, belowRem: band.search.iconBelowRem };
  const rules = [
    ...(band?.facts ?? []).flatMap((fact) =>
      fact.drop === undefined ? [] : [fact.drop],
    ),
    ...(searchRule === undefined ? [] : [searchRule]),
  ];
  return (
    // One tree with or without a band, so Re-read keeps its focus.
    <div ref={ref} className="flex min-w-0 flex-1 items-center gap-panel">
      {band === undefined ? null : (
        <>
          {/* Hidden once empty, so it takes no gap before Read. */}
          <dl className="m-0 flex min-w-0 items-center gap-panel text-row empty:hidden">
            {band.facts
              .filter((fact) => !applies(fact.drop, rules, width))
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
      {/* The search sits in this row, not a group, so it gives way before a fact is cut. */}
      {band?.search === undefined ? null : (
        <SearchBox
          className="ml-auto"
          label={band.search.label}
          value={band.search.value}
          onChange={band.search.onChange}
          compact={applies(searchRule, rules, width)}
        />
      )}
      <div
        className={cn(
          "flex flex-none items-center gap-inline",
          band?.search === undefined && "ml-auto",
        )}
      >
        {children}
      </div>
    </div>
  );
}
