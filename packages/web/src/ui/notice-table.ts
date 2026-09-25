import { HttpError } from "../api/http";
import type { NoticeAction, NoticeContent, NoticeLevel } from "./notice";

// A row carries its own sentence: the server sends only the code and status.
// A warning is written at its call site, never in a table.
type TableRow = {
  level: Exclude<NoticeLevel, "warning">;
  label: string;
  message: string;
  // A call site that knows more replaces it; the two are never both shown.
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

/** The server's own notice for a request that never matched the route's shape. */
export function requestShapeNotice(error: unknown): NoticeContent | null {
  if (!(error instanceof HttpError) || error.code !== "invalid-body") {
    return null;
  }
  const detail = (error.body as { detail?: unknown } | null | undefined)
    ?.detail;
  return {
    level: "error",
    label: "Maestro could not start the action",
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
  // The error's own text never reaches the screen, so neither does apm prose.
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
