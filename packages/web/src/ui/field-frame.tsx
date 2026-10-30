import { type ReactNode, useId } from "react";
import type { Copy } from "./phrase";
import { PhraseText } from "./phrase-text";

/** What the frame hands its control: the id its label names, and its wiring. */
export type FieldControl = {
  id: string;
  /** The label's own id, for a control its content names further. */
  labelId: string;
  describedBy: string | undefined;
  refused: boolean;
};

// The label, hint and error slots every text field shares; the caller draws
// the control. The caller owns when the refusal appears: on submit, or right
// after a pick.
export function FieldFrame({
  label,
  hint,
  error,
  describedBy: extraDescribedBy,
  invalid,
  children,
}: {
  /** Visible, always — a placeholder is not a label. */
  label: string;
  /** What the reader must know before acting, in one sentence. */
  hint: Copy | undefined;
  /** One sentence, shown once the field has been judged. */
  error: string | undefined;
  /** A further describing element, such as a `Notice`; merged with hint and error. */
  describedBy: string | undefined;
  /** Refused by a `Notice` in the slot rather than by `error`. */
  invalid: boolean;
  children: (control: FieldControl) => ReactNode;
}) {
  const id = useId();
  const labelId = `${id}-label`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy =
    [
      hint === undefined ? null : hintId,
      error === undefined ? null : errorId,
      extraDescribedBy ?? null,
    ]
      .filter((each) => each !== null)
      .join(" ") || undefined;

  return (
    <div className="flex flex-col gap-tight">
      <label
        id={labelId}
        htmlFor={id}
        className="font-medium font-ui text-gray-12 text-row"
      >
        {label}
      </label>
      {hint === undefined ? null : (
        <span id={hintId} className="font-ui text-meta text-gray-11">
          <PhraseText copy={hint} />
        </span>
      )}
      {children({
        id,
        labelId,
        describedBy,
        refused: invalid || error !== undefined,
      })}
      {error === undefined ? null : (
        // One line, glyph and sentence together: the mark carries the severity
        // without colour (WCAG 1.4.1) and is hidden from a reader who hears it.
        <span id={errorId} className="font-ui text-meta text-red-11">
          <span aria-hidden="true">✕ </span>
          {error}
        </span>
      )}
    </div>
  );
}
