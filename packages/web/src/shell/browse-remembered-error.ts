import { HttpError } from "../api/http";

// The precise "no longer exists" test for the last-used-folder fallback
// (issue #149) — deliberately narrower than "any error". An unreadable or
// outside-root folder still exists; silently swapping it for home would hide
// a real problem the user should see as the normal in-dialog error banner
// (story 22 of #145), not just a missing one.
export function isFolderMissing(error: unknown): boolean {
  return error instanceof HttpError && error.code === "not-found";
}
