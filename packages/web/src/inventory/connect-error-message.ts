import { HttpError } from "../api/http";

// Shared so a server validation message reads the same regardless of which
// screen (Settings re-point, connect gate) it surfaced on.
export function connectErrorMessage(error: unknown): string | null {
  if (error instanceof HttpError) {
    return error.message;
  }
  return error ? "Could not connect the inventory." : null;
}

// Both surfaces recognise this by typed code, never by string-matching (#147).
export function isNoUsableOriginError(error: unknown): boolean {
  return error instanceof HttpError && error.code === "no-usable-origin";
}
