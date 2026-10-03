import { X } from "lucide-react";
import { Button } from "./button";
import { IconButton } from "./icon-button";
import {
  STATUS_TOKENS,
  type StatusFamily,
  WARNING_GLYPH,
} from "./status-family";

// The one block every warning, error and confirmation is stated in (#465).

export type NoticeLevel = "info" | "success" | "warning" | "error";

export type NoticeAction = {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  /** The pane's one primary action, where its notice names the next step. */
  primary?: boolean;
};

/** A notice's words, without the level its render site picks. */
export type NoticeCopy = {
  label: string;
  message: string;
  /** Why this happened, or the alternative recovery; never a second problem. */
  detail?: string;
};

type NoticeBase = NoticeCopy & {
  /** One line each, listed under the message, such as the checks a skill failed. */
  items?: readonly string[];
};

// A warning may omit its action where the reader can continue without one.
export type NoticeContent = NoticeBase & {
  level: NoticeLevel;
  action?: NoticeAction;
};

type NoticeBaseProps = {
  notice: NoticeContent | null;
  /** For a form field's aria-describedby. */
  id?: string;
};

// Only the outcome of the reader's own action, stated in the panel, can be
// dismissed: a notice raised on load states a condition that is still true.
export type NoticeProps = NoticeBaseProps &
  (
    | {
        /** Did the user just act, or did this appear on load? Always a literal. */
        trigger: "load" | "user-action";
        /** `inline` inside a table row: no panel; a rule on its left carries the level. */
        variant?: "block" | "inline";
        onDismiss?: never;
      }
    | {
        trigger: "user-action";
        variant?: "block";
        /** Renders a close control; the caller clears the outcome it states. */
        onDismiss: () => void;
      }
  );

const FAMILIES: Record<NoticeLevel, StatusFamily> = {
  info: "neutral",
  success: "good",
  warning: "attention",
  error: "failed",
};

// A notice states its status in words; info needs no mark beside them.
const glyphs: Record<NoticeLevel, string | null> = {
  info: null,
  success: STATUS_TOKENS.good.glyph,
  warning: WARNING_GLYPH,
  error: STATUS_TOKENS.failed.glyph,
};

export function Notice({
  trigger,
  notice,
  variant = "block",
  id,
  onDismiss,
}: NoticeProps) {
  if (notice === null) {
    // The region outlives its content: one that appears together with its own
    // text is announced unreliably. sr-only takes it out of flow, so an empty
    // region costs its column no flex gap; aria-live keeps it announceable.
    return <div id={id} aria-live="polite" className="sr-only" />;
  }

  const { level, label, message, detail, items, action } = notice;
  const assertive =
    (level === "warning" || level === "error") && trigger === "user-action";
  const glyph = glyphs[level];
  const tokens = STATUS_TOKENS[FAMILIES[level]];

  return (
    <div
      id={id}
      // The only place the "alert" role may be written (#465).
      role={assertive ? "alert" : "status"}
      className={
        variant === "inline"
          ? `flex gap-inline border-l pl-cell ${tokens.edge}`
          : `flex gap-inline rounded-control border p-cell ${tokens.edge} ${tokens.fill}`
      }
    >
      {glyph === null ? null : (
        <span
          aria-hidden="true"
          className={`font-mono text-meta ${tokens.mark}`}
        >
          {glyph}
        </span>
      )}
      {/* A path or command in the copy has no break point of its own. */}
      <div className="flex min-w-0 flex-col gap-tight wrap-anywhere">
        <span className={`font-semibold font-ui text-meta ${tokens.ink}`}>
          {label}
        </span>
        <span
          className={`font-ui text-meta ${variant === "inline" ? "text-gray-11" : "text-gray-12"}`}
        >
          {message}
        </span>
        {items === undefined || items.length === 0 ? null : (
          <ul className="m-0 flex list-none flex-col gap-tight p-0">
            {items.map((item) => (
              <li key={item} className="font-ui text-gray-12 text-meta">
                {item}
              </li>
            ))}
          </ul>
        )}
        {detail === undefined ? null : (
          <span className="font-ui text-meta text-gray-11">{detail}</span>
        )}
        {action === undefined ? null : (
          <Button
            variant={action.primary ? "primary" : "quiet"}
            size="sm"
            // Button is whitespace-nowrap; a warning's action label states the
            // cost in a sentence, and that pushed the notice 12px out of the
            // 291px detail pane (#615).
            className="self-start whitespace-normal text-left"
            disabled={action.disabled}
            onClick={action.onClick}
          >
            {action.label}
          </Button>
        )}
      </div>
      {onDismiss === undefined ? null : (
        <IconButton
          label={`Close ${label}`}
          variant="ghost"
          className="ml-auto flex-none"
          data-notice-close=""
          onClick={onDismiss}
        >
          <X aria-hidden="true" strokeWidth={1.5} className="size-4" />
        </IconButton>
      )}
    </div>
  );
}
