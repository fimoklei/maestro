import { HttpError } from "../api/http";

// Refusals are recognised by their typed code, never by string-matching the
// message (#147).
export function connectErrorCode(error: unknown): string | null {
  return error instanceof HttpError ? (error.code ?? null) : null;
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
