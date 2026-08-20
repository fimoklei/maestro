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
  /** A property of the control beside it, not a second problem. */
  aside?: string;
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
  /** For a form field's aria-describedby. */
  id?: string;
}

const levelClasses: Record<NoticeLevel, string> = {
  info: "border-line-chip bg-dim-bg",
  success: "border-green-border bg-green-bg",
  warning: "border-amber-border bg-amber-bg",
  error: "border-danger-border bg-danger-bg",
};

const inkClasses: Record<NoticeLevel, string> = {
  info: "text-muted",
  success: "text-green-ink",
  warning: "text-amber-ink",
  error: "text-danger-ink",
};

// Nothing is wrong at info, so there is nothing to mark. The rest carry
// severity without colour (WCAG 1.4.1); all are aria-hidden, the heading
// carries the same fact for everyone else.
const glyphs: Record<NoticeLevel, string | null> = {
  info: null,
  success: "✓",
  warning: "▲",
  error: "✕",
};

export function Notice({ trigger, notice, id }: NoticeProps) {
  if (notice === null) {
    // The region outlives its content: one that appears together with its own
    // text is announced unreliably. sr-only takes it out of flow, so an empty
    // region costs its column no flex gap; aria-live keeps it announceable.
    return <div id={id} aria-live="polite" className="sr-only" />;
  }

  const { level, label, message, aside, action } = notice;
  const assertive =
    (level === "warning" || level === "error") && trigger === "user-action";
  const glyph = glyphs[level];

  return (
    <div
      id={id}
      // Derived, never chosen — which is why the literal string "alert" is
      // built here rather than written at any call site.
      role={assertive ? "alert" : "status"}
      className={`flex gap-1.5 rounded-control border px-2.5 py-2.5 ${levelClasses[level]}`}
    >
      {glyph === null ? null : (
        <span
          aria-hidden="true"
          className={`font-mono text-desc ${inkClasses[level]}`}
        >
          {glyph}
        </span>
      )}
      <div className="flex min-w-0 flex-col gap-1">
        <span
          className={`font-semibold font-ui text-desc ${inkClasses[level]}`}
        >
          {label}
        </span>
        <span className="font-ui text-desc text-fg-2">{message}</span>
        {aside === undefined ? null : (
          <span className="font-ui text-desc text-dim">{aside}</span>
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
