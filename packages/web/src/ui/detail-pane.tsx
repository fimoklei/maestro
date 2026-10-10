import { X } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { orderedItems } from "./actions-menu";
import { Button } from "./button";
import { cn } from "./cn";
import { FactList, FactRow } from "./fact-list";
import { FOCUS_RING } from "./focus-ring";
import { FootActions, type FootItem, firstEnabled } from "./foot-actions";
import { Icon } from "./icon";
import { IconButton } from "./icon-button";
import { Notice, type NoticeContent } from "./notice";
import { type Copy, plainText } from "./phrase";
import { PhraseText } from "./phrase-text";
import { useDetailPaneFocus } from "./use-detail-pane-focus";

// Where a screen puts its pane (#1065, #1456): beside the table at every
// width, which hides secondary columns to make room. Below a 44rem panel the
// name, Status and ⋮ no longer fit beside it, so the pane takes the panel
// and `TableScreen` hides the table.
export function DetailPaneSlot({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-none @max-[44rem]:flex-1 @max-[44rem]:*:w-full">
      {children}
    </div>
  );
}

export type Fact = {
  label: string;
  value: ReactNode;
  /** A version, tag, path, ref or hash: the one thing Geist Mono sets. */
  machine?: boolean;
  /** The whole value on hover and focus, where the row shortens it. */
  fullValue?: string;
  /** A link beside the value, such as the GitHub mark. */
  link?: ReactNode;
  /** The one action beside the value, for an action that changes this fact. */
  action?: FootItem;
};

export type PaneNotice = {
  content: NoticeContent;
  trigger: "load" | "user-action";
  /** Its action retries an unfinished operation: the next step. */
  retry?: boolean;
};

const STEPS = ["import", "update"] as const;

// The one primary by state: a notice's retry, else Import local edits, which
// Update target would discard, else Update target, else none; a pane whose ⋮ order leads with the next step makes
// its first enabled item primary.
function choosePrimary(
  notices: readonly PaneNotice[],
  items: readonly FootItem[],
  leadsWithNextStep: boolean,
): PaneNotice | FootItem | null {
  const retry = notices.find((notice) => notice.retry && notice.content.action);
  if (retry) return retry;
  for (const step of STEPS) {
    const item = items.find((candidate) => candidate.step === step);
    if (item) return item;
  }
  if (!leadsWithNextStep) return null;
  const label = firstEnabled(orderedItems(items));
  return items.find((item) => item.label === label) ?? null;
}

// A key typed into one of these belongs to it, not to the pager.
const OWNS_ARROWS = "input,select,textarea,[role=menu],[role=listbox]";

export function DetailPane({
  title,
  activeKey,
  position = null,
  onPage,
  onClose,
  getTriggerElement,
  initialFocus,
  facts = [],
  paragraph = [],
  clampParagraph = false,
  notices = [],
  subList,
  foot = [],
  leadsWithNextStep = false,
}: {
  /** The subject's name; the pane's heading and landmark name. */
  title: string;
  /** Identifies the subject, so focus moves again when the pager moves. */
  activeKey: string;
  /** Where the subject sits in the table; null once the table hides it. */
  position?: { index: number; count: number } | null;
  /** Called with -1 or 1 on the arrow keys, never past either end. */
  onPage?: (step: -1 | 1) => void;
  onClose: () => void;
  // A lookup, not a resolved element: the row behind an open pane can unmount
  // and remount as a new DOM node, so it must be found fresh at close time.
  getTriggerElement: (key: string) => HTMLElement | null;
  /** A selector inside the pane to focus on open; null leaves focus alone. */
  initialFocus?: string | null;
  facts?: readonly (Fact | null)[];
  /** The sentences that explain the subject's state. */
  paragraph?: readonly Copy[];
  /** Three lines of the long last line, the rest opening on ask; the lines above stay whole. */
  clampParagraph?: boolean;
  notices?: readonly PaneNotice[];
  subList?: ReactNode;
  /** The row's ⋮ items the pane places nowhere else, in ⋮ order. */
  foot?: readonly FootItem[];
  /** The ⋮ order already leads with the next step, so its first item is primary. */
  leadsWithNextStep?: boolean;
}) {
  const clampedId = useId();
  // Open for one subject only: the next one starts clamped.
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const expanded = expandedKey === activeKey;
  const shown = facts.filter((fact) => fact !== null);
  const clamped = clampParagraph ? (paragraph.at(-1) ?? null) : null;
  const whole = clamped === null ? paragraph : paragraph.slice(0, -1);
  const primary = choosePrimary(
    notices,
    [...shown.flatMap((fact) => (fact.action ? [fact.action] : [])), ...foot],
    leadsWithNextStep,
  );
  const { paneRef, headingRef } = useDetailPaneFocus({
    activeKey,
    getTriggerElement,
    onClose,
    initialFocus,
  });

  const onKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (onPage === undefined || position === null) return;
    const step =
      event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : null;
    if (step === null) return;
    if ((event.target as HTMLElement).closest(OWNS_ARROWS)) return;
    const next = position.index + step;
    if (next < 0 || next >= position.count) return;
    event.preventDefault();
    onPage(step);
  };

  return (
    <aside
      ref={paneRef}
      aria-label={`${title} detail`}
      onKeyDown={onKeyDown}
      className="flex h-full w-90 max-w-full flex-none flex-col border-edge border-l bg-gray-1"
    >
      <div className="flex h-12 flex-none items-center gap-inline border-edge border-b px-panel">
        <h2
          ref={headingRef}
          tabIndex={-1}
          data-pane-heading=""
          className="m-0 min-w-0 flex-1 truncate font-semibold text-gray-12 text-heading tracking-heading focus-visible:outline-2 focus-visible:outline-blue-9 focus-visible:outline-offset-2"
        >
          {title}
        </h2>
        {position === null ? null : (
          <span className="text-gray-11 text-meta tabular-nums">
            <span aria-hidden="true">
              {position.index + 1} / {position.count}
            </span>
            <span className="sr-only">
              {position.index + 1} of {position.count}
            </span>
          </span>
        )}
        <IconButton
          label={`Close ${title} detail`}
          variant="ghost"
          onClick={onClose}
        >
          <Icon of={X} />
        </IconButton>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-panel">
        {shown.length > 0 ? (
          <FactList size="row">
            {shown.map((fact) => (
              <FactRow
                key={fact.label}
                label={fact.label}
                machine={fact.machine}
                fullValue={fact.fullValue}
                action={
                  fact.action ? (
                    <Button
                      variant={fact.action === primary ? "primary" : "quiet"}
                      aria-label={fact.action.name}
                      onClick={fact.action.onSelect}
                    >
                      {fact.action.label}
                    </Button>
                  ) : (
                    fact.link
                  )
                }
              >
                {fact.value}
              </FactRow>
            ))}
          </FactList>
        ) : null}
        {whole.length === 0 ? null : (
          <p className="m-0 mt-section flex flex-col gap-tight text-gray-12 text-prose">
            {whole.map((line, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: two lines may read alike
              <span key={`${index}:${plainText(line)}`}>
                <PhraseText copy={line} />
              </span>
            ))}
          </p>
        )}
        {clamped === null ? null : (
          <div
            className={cn(
              "text-gray-12 text-prose",
              whole.length > 0 ? "mt-tight" : "mt-section",
            )}
          >
            <span
              id={clampedId}
              className={cn("block", !expanded && "line-clamp-3")}
            >
              <PhraseText copy={clamped} />
            </span>
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={clampedId}
              onClick={() => setExpandedKey(expanded ? null : activeKey)}
              className={cn(
                "mt-tight inline-block cursor-pointer rounded-control text-gray-11 text-meta hover:text-gray-12",
                FOCUS_RING,
              )}
            >
              {expanded ? "Less" : "More"}
              <span aria-hidden="true">{expanded ? " ‹" : " ›"}</span>
            </button>
          </div>
        )}
        {notices.length > 0 ? (
          <div className="mt-cell flex flex-col gap-cell">
            {notices.map((notice) => (
              <Notice
                key={notice.content.label}
                trigger={notice.trigger}
                notice={
                  notice.content.action
                    ? {
                        ...notice.content,
                        action: {
                          ...notice.content.action,
                          primary: notice === primary,
                        },
                      }
                    : notice.content
                }
              />
            ))}
          </div>
        ) : null}
        {subList ? <div className="mt-section">{subList}</div> : null}
      </div>
      {foot.length > 0 ? (
        <div className="flex flex-none flex-wrap items-start gap-inline border-edge border-t p-panel">
          <FootActions
            items={foot}
            primary={foot.find((item) => item === primary)?.label ?? null}
          />
        </div>
      ) : null}
    </aside>
  );
}
