import { HttpError } from "../api/http";
import type { NoticeAction, NoticeContent, NoticeLevel } from "./notice";

// A row carries its own sentence: the server sends the code and the status
// alone (ADR-0025). A warning is written at its call site instead — see
// ADR-0025 for why a table cannot hold one.
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

/**
 * The one notice the server writes, not `web` (ADR-0025 §8): the request never
 * matched the route's shape. Null for every other failure. Every builder that
 * can meet `invalid-body` renders it through here, so the three read alike.
 */
export function requestShapeNotice(error: unknown): NoticeContent | null {
  if (!(error instanceof HttpError) || error.code !== "invalid-body") {
    return null;
  }
  const detail = (error.body as { detail?: unknown } | null | undefined)
    ?.detail;
  return {
    level: "error",
    label: "Request not accepted",
    message: error.message,
    ...(typeof detail === "string" ? { detail } : {}),
  };
}

export function noticeFromTable<TCode extends string>(
  table: NoticeTable<TCode>,
  error: unknown,
  fallback: NoticeFallback,
  extras: NoticeExtras = {},
): NoticeContent | null {
  if (!error) {
    return null;
  }
  const requestShape = requestShapeNotice(error);
  if (requestShape) {
    return requestShape;
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
