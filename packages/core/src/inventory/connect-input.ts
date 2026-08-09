// Which route one connect field takes, decided offline: a GitHub origin is a
// clone, anything else is the existing local path, and any other remote is
// refused before a network call (#554, ADR-0014).
import { join } from "node:path";
import { parseGitOrigin } from "../deploy/git-origin";

export type ConnectInputError = "not-a-github-url";

export type ConnectInputRoute =
  | { ok: true; kind: "path" }
  | { ok: true; kind: "url"; url: string; repoName: string }
  | { ok: false; error: ConnectInputError };

// A remote spelling, not a local one: a scheme, or the scp-like `user@host:`
// form. An absolute path may contain `@`, but never a colon right after it.
const scpLike = /^[^/\s]+@[^/\s:]+:/;

const looksRemote = (input: string): boolean =>
  input.includes("://") || scpLike.test(input);

export const classifyConnectInput = (input: string): ConnectInputRoute => {
  const trimmed = input.trim();
  if (!looksRemote(trimmed)) {
    return { ok: true, kind: "path" };
  }
  const origin = parseGitOrigin(trimmed);
  if (origin === null) {
    return { ok: false, error: "not-a-github-url" };
  }
  const repoName = origin.ownerRepo.split("/")[1] ?? "";
  // The name becomes a new folder under the home ceiling, so a relative
  // segment here would place the clone outside it (security.md).
  if (repoName === "" || repoName === "." || repoName === "..") {
    return { ok: false, error: "not-a-github-url" };
  }
  return { ok: true, kind: "url", url: trimmed, repoName };
};

export const cloneDestination = (homeRoot: string, repoName: string): string =>
  join(homeRoot, repoName);
