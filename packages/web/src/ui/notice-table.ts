import { HttpError } from "../api/http";
import type { NoticeAction, NoticeContent, NoticeLevel } from "./notice";

// `web` owns the heading and the level for every code a server error table
// can return; the server sends the sentence and nothing else. A table is
// exhaustive by compiler, so a new code in `core` fails typecheck without one.

// No warning: a warning must carry the consequence it costs as a required
// action, which a table cannot know. Those are written at the call site.
export type NoticeHeading = {
  level: Exclude<NoticeLevel, "warning">;
  label: string;
};

export type NoticeTable<TCode extends string> = Record<TCode, NoticeHeading>;

export type NoticeExtras = { action?: NoticeAction; aside?: string };

export function noticeFromTable<TCode extends string>(
  table: NoticeTable<TCode>,
  error: unknown,
  fallbackLabel: string,
  extras: NoticeExtras = {},
): NoticeContent | null {
  if (!error) {
    return null;
  }
  const heading =
    error instanceof HttpError
      ? (table as Record<string, NoticeHeading | undefined>)[error.code ?? ""]
      : undefined;
  // A failure with no code at all — a dropped connection, a shape the server
  // never sends. The heading still names what is wrong; apm prose never
  // reaches it (ADR-0018).
  return heading === undefined
    ? {
        level: "error",
        label: fallbackLabel,
        message: "The Maestro server did not answer that request.",
        ...extras,
      }
    : {
        level: heading.level,
        label: heading.label,
        message: (error as Error).message,
        ...extras,
      };
}
