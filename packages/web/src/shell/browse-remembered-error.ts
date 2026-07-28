import { HttpError } from "../api/http";

// The "cannot be reached from here" test for the last-used-folder fallback
// (issue #149, widened by #406) — deliberately narrower than "any error". A
// folder that is gone (not-found) and one beyond the home ceiling
// (outside-root) are both unreachable from this session, so reopening at home
// is the only move left; the ceiling shifts whenever HOME does, which is every
// switch between worktrees or between dev and smoke. An unreadable folder is
// different: it exists and is in bounds, so silently swapping it for home
// would hide a real problem the user should see as the normal in-dialog error
// banner (story 22 of #145).
export function isRememberedFolderUnreachable(error: unknown): boolean {
  return (
    error instanceof HttpError &&
    (error.code === "not-found" || error.code === "outside-root")
  );
}
