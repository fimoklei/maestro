import { Clock } from "lucide-react";
import { type ReactNode, useRef } from "react";
import { READ_AGE_NAME } from "./band-copy";
import { BandFact, type BandFactProps } from "./band-fact";
import { type BandSummaryInput, bandSummary } from "./band-summary";
import { cn } from "./cn";
import { SearchBox } from "./search-box";
import { STATUS_TOKENS } from "./status-family";
import { useNow } from "./use-now";
import { useWidthRem } from "./use-width-rem";

/** Drops the fact while band 2 is narrower than `belowRem`; rank 1 drops first. */
type FactDrop = { rank: 1 | 2 | 3; belowRem: number };

// The search's rule ranks above every fact rank, so it applies last.
type DropRule = { rank: FactDrop["rank"] | "search"; belowRem: number };
const order = (rank: DropRule["rank"]) =>
  rank === "search" ? Number.POSITIVE_INFINITY : rank;

type BandFactItem = BandFactProps & {
  /** None: the fact never drops. */
  drop?: FactDrop;
};

/** Band 2's search, first on the right; it narrows to 12rem, then becomes an icon last. */
type BandSearch = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Band width in rem below which the search is an icon. */
  iconBelowRem: number;
};

/** Band 2: the summary, the facts in order, then the read age; an optional search on the right. */
export type Band = {
  summary: BandSummaryInput;
  facts: readonly BandFactItem[];
  search?: BandSearch;
};

const Separator = () => (
  <span aria-hidden="true" className="h-4 w-px flex-none bg-gray-6" />
);

// A rule applies while the band is narrower than it, and also while any rule of
// its rank or higher applies, so the order holds whatever the widths say.
const applies = (
  rule: DropRule | undefined,
  rules: readonly DropRule[],
  width: number | null,
) =>
  width !== null &&
  rule !== undefined &&
  rules.some(
    (other) => order(other.rank) >= order(rule.rank) && width < other.belowRem,
  );

/** Band 2: summary, facts and read age on the left; the search, then the screen's controls, on the right. */
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
  const now = useNow();
  const summary = band === undefined ? null : bandSummary(band.summary, now);
  const searchRule: DropRule | undefined =
    band?.search === undefined
      ? undefined
      : { rank: "search", belowRem: band.search.iconBelowRem };
  const rules: DropRule[] = [
    ...(band?.facts ?? []).flatMap((fact) =>
      fact.drop === undefined ? [] : [fact.drop],
    ),
    ...(searchRule === undefined ? [] : [searchRule]),
  ];
  const facts = (band?.facts ?? []).filter(
    (fact) => !applies(fact.drop, rules, width),
  );
  return (
    // One tree with or without a band, so Re-read keeps its focus.
    <div ref={ref} className="flex min-w-0 flex-1 items-center gap-panel">
      {summary === null ? null : (
        <>
          <span className="flex flex-none items-center gap-inline whitespace-nowrap text-row text-gray-11">
            <span
              aria-hidden="true"
              className={cn(
                "size-2 flex-none rounded-full",
                STATUS_TOKENS[summary.family].dot,
              )}
            />
            {summary.word === null ? null : <span>{summary.word}</span>}
            {summary.counts.map((each) => (
              <span key={each.word}>{`${each.word} ${each.count}`}</span>
            ))}
          </span>
          {facts.length === 0 ? null : (
            <>
              <Separator />
              <dl className="m-0 flex min-w-0 items-center gap-panel text-row">
                {facts.map(({ drop: _drop, ...fact }) => (
                  <BandFact key={fact.label} {...fact} />
                ))}
              </dl>
            </>
          )}
          {summary.age === null ? null : (
            <>
              <Separator />
              <span className="flex flex-none items-center gap-tight whitespace-nowrap text-gray-11 text-meta">
                <Clock
                  role="img"
                  aria-label={READ_AGE_NAME}
                  strokeWidth={1.5}
                  className="size-3"
                />
                {summary.age}
              </span>
            </>
          )}
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
