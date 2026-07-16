import { HttpError } from "../api/http";

// Shared mapping from a connect mutation's error to the readable text shown
// next to the path field. Both the Settings re-point screen and the wizard's
// connect step need this, and it must stay identical between them — a server
// validation message should read the same regardless of which screen it
// surfaced on.
export function connectErrorMessage(error: unknown): string | null {
  if (error instanceof HttpError) {
    return error.message;
  }
  return error ? "Could not connect the inventory." : null;
}

// The connect-time origin refusal (#147) gets its own affordance — an amber
// card with a "browse again…" call to action — so both connect surfaces need
// to recognise it by typed code, never by string-matching the message.
export function isNoUsableOriginError(error: unknown): boolean {
  return error instanceof HttpError && error.code === "no-usable-origin";
}
