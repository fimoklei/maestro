import type { PullRequestRef } from "@maestro/core";
import { ArrowUpRight } from "lucide-react";
import {
  isValidElement,
  type ReactElement,
  type ReactNode,
  useId,
} from "react";
import { Button } from "./button";
import { cn } from "./cn";
import { Icon } from "./icon";
import type { NoticeCopy } from "./notice";
import type { Copy } from "./phrase";
import { PhraseText } from "./phrase-text";
import { PullRequestLinkList } from "./pull-request-link";
import {
  STATUS_TOKENS,
  type StatusFamily,
  WARNING_GLYPH,
} from "./status-family";

// What one action did to several primitives, worst group first.

type ReportTone = Exclude<StatusFamily, "unknown">;

type ReportRow = {
  name: string;
  /** What the change does, as the Harness's Change column states it, such as `Added`. */
  change?: string;
  /** The pull request this row opened or updated. */
  pullRequest?: PullRequestRef;
  /** A GitHub page this row's reader opens next, such as a compare page. */
  compare?: { label: string; url: string };
  /** Why this row reads the way it does, in one or two short sentences. */
  detail?: Copy | ReactElement;
  /** A refusal or failure, stated as the same notice a single action shows. */
  notice?: NoticeCopy;
  /** How many primitives the row stands for, where one reason hit several. */
  count?: number;
  /** This row's own way out, where the reader has one. */
  action?: ReportRowAction;
};

export type ReportRowAction = {
  label: string;
  onClick: () => void;
  /** `busy`: this action runs; `locked`: another one does. */
  status?: "busy" | "locked";
};

export type ReportGroup = {
  tone: ReportTone;
  /** The group's status word. The count is drawn beside it. */
  label: string;
  /** One sentence for the whole group, such as its next step, after its rows. */
  note?: string;
  /**
   * A group that needs the reader, but whose next step a lead above states
   * once: a calm list with its family's edge instead of a box.
   */
  calm?: boolean;
  rows: readonly ReportRow[];
};

// Worst first: the reader meets what needs them before what went well.
const ORDER: ReportTone[] = ["failed", "attention", "neutral", "good"];

// Literal class names: Tailwind finds only what it can read in the source.
// A group that needs the reader sits in a box of its family; the rest are a
// calm list whose legend keeps its family's mark only.
const LOOK: Record<
  ReportTone,
  { glyph: string | null; legend: string; boxed: boolean; ink: string }
> = {
  failed: {
    glyph: STATUS_TOKENS.failed.glyph,
    legend: STATUS_TOKENS.failed.ink,
    boxed: true,
    ink: STATUS_TOKENS.failed.ink,
  },
  attention: {
    glyph: WARNING_GLYPH,
    legend: STATUS_TOKENS.attention.ink,
    boxed: true,
    ink: STATUS_TOKENS.attention.ink,
  },
  neutral: { glyph: null, legend: "text-gray-11", boxed: false, ink: "" },
  good: {
    glyph: STATUS_TOKENS.good.glyph,
    legend: "text-gray-11",
    boxed: false,
    ink: "",
  },
};

export function Report({
  heading,
  lead = null,
  groups,
}: {
  heading: string;
  /** Drawn under the heading, before the groups, such as the places written to. */
  lead?: ReactNode;
  groups: readonly ReportGroup[];
}) {
  const id = useId();
  const drawn = ORDER.flatMap((tone) =>
    groups.filter((group) => group.tone === tone && group.rows.length > 0),
  );

  return (
    <div className="flex min-w-0 flex-col gap-section">
      {/* Announced where it stands, so focus is not moved to it. */}
      <div role="status">
        {/* Under the dialog's own h2 title: a Report never stands alone. */}
        <h3 className="m-0 font-medium font-ui text-gray-12 text-prose">
          {heading}
        </h3>
      </div>
      {lead}
      {drawn.map((group, index) => (
        <Group key={group.label} group={group} headingId={`${id}-${index}`} />
      ))}
    </div>
  );
}

function Group({
  group,
  headingId,
}: {
  group: ReportGroup;
  headingId: string;
}) {
  const look =
    group.calm === true
      ? { ...LOOK[group.tone], boxed: false }
      : LOOK[group.tone];
  const edge =
    group.calm === true ? STATUS_TOKENS[group.tone].edge : "border-edge";
  const count = group.rows.reduce((total, row) => total + (row.count ?? 1), 0);
  return (
    <section
      aria-labelledby={headingId}
      className="flex min-w-0 flex-col gap-tight"
    >
      <h4
        id={headingId}
        className={cn(
          "m-0 flex items-center gap-tight pb-tight font-normal font-ui text-meta",
          look.legend,
        )}
      >
        {look.glyph === null ? null : (
          <span
            aria-hidden="true"
            className={cn("font-mono", STATUS_TOKENS[group.tone].mark)}
          >
            {look.glyph}
          </span>
        )}
        {`${group.label} · ${count}`}
      </h4>
      <ul
        className={cn(
          "m-0 flex min-w-0 list-none flex-col overflow-hidden rounded-control border p-0",
          look.boxed
            ? cn(STATUS_TOKENS[group.tone].edge, STATUS_TOKENS[group.tone].fill)
            : edge,
        )}
      >
        {group.rows.map((row, index) => {
          const divided =
            index > 0 &&
            (look.boxed || group.calm === true
              ? STATUS_TOKENS[group.tone].edge
              : "border-divider");
          return look.boxed ? (
            <BoxedRow
              key={row.name}
              row={row}
              ink={look.ink}
              divider={divided}
            />
          ) : (
            <ListRow key={row.name} row={row} divider={divided} />
          );
        })}
      </ul>
      {group.note === undefined ? null : (
        <p className="m-0 font-ui text-gray-11 text-meta">{group.note}</p>
      )}
    </section>
  );
}

// A failed or attention row: its name and Change word, then its reason with
// the next step below.
function BoxedRow({
  row,
  ink,
  divider,
}: {
  row: ReportRow;
  ink: string;
  divider: string | false;
}) {
  return (
    <li
      className={cn(
        "flex min-w-0 flex-col gap-tight px-cell py-inline font-ui",
        divider !== false && cn("border-t", divider),
      )}
    >
      <span className="flex min-w-0 items-center gap-inline">
        <span className="min-w-0 flex-1 text-gray-12 text-row wrap-anywhere">
          {row.name}
        </span>
        <Change change={row.change} ink={ink} />
        <CompareLink compare={row.compare} />
        <RowAction action={row.action} />
      </span>
      {row.detail === undefined ? null : (
        <span className={cn("text-meta", ink)}>
          <Detail detail={row.detail} />
        </span>
      )}
      {row.notice === undefined ? null : (
        <span className={cn("flex flex-col gap-tight text-meta", ink)}>
          <span className="font-medium">{row.notice.label}</span>
          <span>
            <PhraseText copy={row.notice.message} />
          </span>
          {row.notice.detail === undefined ? null : (
            <span>
              <PhraseText copy={row.notice.detail} />
            </span>
          )}
        </span>
      )}
    </li>
  );
}

// A 32px row of a calm group: its name, any fact, its Change word, and its
// pull request.
function ListRow({
  row,
  divider,
}: {
  row: ReportRow;
  divider: string | false;
}) {
  return (
    <li
      className={cn(
        "flex min-h-row min-w-0 items-center gap-inline px-cell py-tight font-ui",
        divider !== false && cn("border-t", divider),
      )}
    >
      <span className="min-w-0 flex-1 text-gray-12 text-row wrap-anywhere">
        {row.name}
      </span>
      {row.detail === undefined ? null : (
        <span className="text-gray-11 text-meta">
          <Detail detail={row.detail} />
        </span>
      )}
      <Change change={row.change} ink="text-gray-11" />
      <CompareLink compare={row.compare} />
      {row.pullRequest === undefined ? null : (
        <span className="flex w-16 flex-none justify-end text-row">
          <PullRequestLinkList requests={[row.pullRequest]} focusable={true} />
        </span>
      )}
      <RowAction action={row.action} />
    </li>
  );
}

function Detail({ detail }: { detail: Copy | ReactElement }) {
  return isValidElement(detail) ? detail : <PhraseText copy={detail} />;
}

function Change({ change, ink }: { change?: string; ink: string }) {
  return change === undefined ? null : (
    <span className={cn("w-18 flex-none text-meta", ink)}>{change}</span>
  );
}

// The GitHub page a row's reader opens next, in a new tab. Slate, as the
// pull-request links are: blue 11 on a hovered row falls under 4.5:1.
function CompareLink({ compare }: { compare?: ReportRow["compare"] }) {
  return compare === undefined ? null : (
    <a
      href={compare.url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex shrink-0 items-center gap-tight rounded-control text-gray-12 text-meta no-underline hover:underline focus-visible:outline-2 focus-visible:outline-blue-9 focus-visible:outline-offset-2"
    >
      {compare.label}
      <Icon of={ArrowUpRight} small />
    </a>
  );
}

function RowAction({ action }: { action?: ReportRowAction }) {
  return action === undefined ? null : (
    <Button
      variant="quiet"
      size="sm"
      className="shrink-0"
      busy={action.status === "busy"}
      aria-disabled={action.status !== undefined || undefined}
      onClick={action.status === undefined ? action.onClick : undefined}
    >
      {action.label}
    </Button>
  );
}
