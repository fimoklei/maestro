import { HttpError } from "../api/http";

// Deliberately narrower than "any error" (#149, #406): not-found/outside-root
// mean home is the only move left. An unreadable folder is in bounds and
// shows the normal error banner instead (#145).
export function isRememberedFolderUnreachable(error: unknown): boolean {
  return (
    error instanceof HttpError &&
    (error.code === "not-found" || error.code === "outside-root")
  );
}
