import { Button } from "./button";

// The one block every warning, error and confirmation is stated in — see #465
// for the standard and what it rejected.

export type NoticeLevel = "info" | "success" | "warning" | "error";

export type NoticeAction = {
  label: string;
  onClick: () => void;
  disabled?: boolean;
};

type NoticeBase = {
  label: string;
  message: string;
  /**
   * Why this happened, or the alternative recovery — one sentence, never a
   * second problem (`.claude/rules/copy.md`).
   */
  detail?: string;
};

// The union is the enforcement: a warning cannot compile without the
// consequence it costs stated as something the user can do.
export type NoticeContent = NoticeBase &
  (
    | { level: "info" | "success" | "error"; action?: NoticeAction }
    | { level: "warning"; action: NoticeAction }
  );

export interface NoticeProps {
  /** Did the user just act, or did this appear on load? Always a literal. */
  trigger: "load" | "user-action";
  notice: NoticeContent | null;
  /**
   * `inline` for a notice inside a table row: a filled, outlined panel there is
   * a card inside a card, which this system rejects (DESIGN.md §6). The rule
   * on its left carries the level instead.
   */
  variant?: "block" | "inline";
  /** For a form field's aria-describedby. */
  id?: string;
}

const borderClasses: Record<NoticeLevel, string> = {
  info: "border-gray-7",
  success: "border-green-7",
  warning: "border-amber-7",
  error: "border-red-7",
};

const fillClasses: Record<NoticeLevel, string> = {
  info: "bg-gray-3",
  success: "bg-green-3",
  warning: "bg-amber-3",
  error: "bg-red-3",
};

// Text on step 12, the glyph on step 11 (ADR-0033 §1).
const inkClasses: Record<NoticeLevel, string> = {
  info: "text-gray-11",
  success: "text-green-12",
  warning: "text-amber-12",
  error: "text-red-12",
};

const MARK_CLASSES: Record<NoticeLevel, string> = {
  info: "text-gray-11",
  success: "text-green-11",
  warning: "text-amber-11",
  error: "text-red-11",
};

// Nothing is wrong at info, so there is nothing to mark. The rest carry
// severity without colour (WCAG 1.4.1); all are aria-hidden, the heading
// carries the same fact for everyone else.
const glyphs: Record<NoticeLevel, string | null> = {
  info: null,
  success: "✓",
  warning: "⚠",
  error: "✕",
};

export function Notice({
  trigger,
  notice,
  variant = "block",
  id,
}: NoticeProps) {
  if (notice === null) {
    // The region outlives its content: one that appears together with its own
    // text is announced unreliably. sr-only takes it out of flow, so an empty
    // region costs its column no flex gap; aria-live keeps it announceable.
    return <div id={id} aria-live="polite" className="sr-only" />;
  }

  const { level, label, message, detail, action } = notice;
  const assertive =
    (level === "warning" || level === "error") && trigger === "user-action";
  const glyph = glyphs[level];

  return (
    <div
      id={id}
      // Derived, never chosen — which is why the literal string "alert" is
      // built here rather than written at any call site.
      role={assertive ? "alert" : "status"}
      className={
        variant === "inline"
          ? `flex gap-1.5 border-l pl-2.5 ${borderClasses[level]}`
          : `flex gap-1.5 rounded-control border px-2.5 py-2.5 ${borderClasses[level]} ${fillClasses[level]}`
      }
    >
      {glyph === null ? null : (
        <span
          aria-hidden="true"
          className={`font-mono text-meta ${MARK_CLASSES[level]}`}
        >
          {glyph}
        </span>
      )}
      <div className="flex min-w-0 flex-col gap-1">
        <span
          className={`font-semibold font-ui text-meta ${inkClasses[level]}`}
        >
          {label}
        </span>
        {/* Inline the notice is an aside beside the row's own sentence, so it
            sits on the same step; the panel has a surface to lift off. */}
        <span
          className={`font-ui text-meta ${variant === "inline" ? "text-gray-11" : "text-gray-12"}`}
        >
          {message}
        </span>
        {detail === undefined ? null : (
          <span className="font-ui text-meta text-gray-11">{detail}</span>
        )}
        {action === undefined ? null : (
          <Button
            variant="quiet"
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
    </div>
  );
}
