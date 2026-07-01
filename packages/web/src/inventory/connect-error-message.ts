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
