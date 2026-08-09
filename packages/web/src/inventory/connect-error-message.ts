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

// The repository the refusal offers to scaffold, or null when it offers
// nothing. The path comes from the server because a cloned repository sits
// somewhere the user never typed (#556).
export function scaffoldOfferPath(error: unknown): string | null {
  if (!(error instanceof HttpError) || error.code !== "scaffoldable") {
    return null;
  }
  const { path } = (error.body ?? {}) as { path?: unknown };
  return typeof path === "string" && path !== "" ? path : null;
}
