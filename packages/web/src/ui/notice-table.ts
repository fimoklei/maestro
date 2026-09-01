import { HttpError } from "../api/http";
import type { NoticeAction, NoticeContent, NoticeLevel } from "./notice";

// `web` owns the heading and the level for every code a server error table can
// return. A table is exhaustive by compiler, so a new code in `core` fails
// typecheck without a row.
export type NoticeHeading = {
  level: NoticeLevel;
  label: string;
  message?: string;
};

// A row carries its own sentence: the server sends the code and the status
// alone (ADR-0025). No warning in a table either — a warning must carry the
// consequence it costs as a required action, which a table cannot know. Those
// are written at the call site.
type TableRow = {
  level: Exclude<NoticeLevel, "warning">;
  label: string;
  message: string;
  // Why this happened, or the alternative recovery. A call site that knows
  // more replaces it; the two are never both shown (`.claude/rules/copy.md`).
  detail?: string;
};

export type NoticeTable<TCode extends string> = Record<TCode, TableRow>;

export type NoticeExtras = { action?: NoticeAction; detail?: string };

/** The caller's own words for a failure no row in its table covers. */
export type NoticeFallback = {
  label: string;
  message: string;
  detail?: string;
};

export function noticeFromTable<TCode extends string>(
  table: NoticeTable<TCode>,
  error: unknown,
  fallback: NoticeFallback,
  extras: NoticeExtras = {},
): NoticeContent | null {
  if (!error) {
    return null;
  }
  const row =
    error instanceof HttpError
      ? (table as Record<string, TableRow | undefined>)[error.code ?? ""]
      : undefined;
  // A failure no row covers — a dropped connection, a code this build
  // predates. The caller states what that cost it; the error's own text never
  // reaches the screen, so neither does apm prose (ADR-0018).
  const chosen = row ?? { level: "error" as const, ...fallback };
  return {
    level: chosen.level,
    label: chosen.label,
    message: chosen.message,
    ...extras,
    // Explicit rather than spread: a call site passing `detail: undefined`
    // would otherwise erase the row's own.
    detail: extras.detail ?? chosen.detail,
  };
}
