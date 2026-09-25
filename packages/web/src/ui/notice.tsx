import { Button } from "./button";

// The one block every warning, error and confirmation is stated in (#465).

export type NoticeLevel = "info" | "success" | "warning" | "error";

export type NoticeAction = {
  label: string;
  onClick: () => void;
  disabled?: boolean;
};

type NoticeBase = {
  label: string;
  message: string;
  /** Why this happened, or the alternative recovery; never a second problem. */
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
  /** `inline` inside a table row: no panel; a rule on its left carries the level. */
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
      // The only place the "alert" role may be written (#465).
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
