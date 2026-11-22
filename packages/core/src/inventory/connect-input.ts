import { parseGitOrigin } from "../deploy/git-origin";

export type ConnectInputError = "not-a-github-url" | "url-carries-credentials";

export type ConnectInputRoute =
  | { ok: true; kind: "path" }
  | { ok: true; kind: "url"; url: string; repoName: string; ownerRepo: string }
  | { ok: false; error: ConnectInputError };

const scpLike = /^[^/\s@]+@[^/\s:]+:/;

const looksRemote = (input: string): boolean =>
  input.includes("://") || scpLike.test(input);

const carriesCredentials = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return parsed.username !== "" || parsed.password !== "";
  } catch {
    return false;
  }
};

export const classifyConnectInput = (input: string): ConnectInputRoute => {
  const trimmed = input.trim();
  if (!looksRemote(trimmed)) {
    return { ok: true, kind: "path" };
  }
  if (trimmed.includes("://") && carriesCredentials(trimmed)) {
    return { ok: false, error: "url-carries-credentials" };
  }
  const origin = parseGitOrigin(trimmed);
  if (origin === null) {
    return { ok: false, error: "not-a-github-url" };
  }
  const repoName = origin.ownerRepo.split("/")[1] ?? "";
  if (repoName === "" || repoName === "." || repoName === "..") {
    return { ok: false, error: "not-a-github-url" };
  }
  return {
    ok: true,
    kind: "url",
    url: trimmed,
    repoName,
    ownerRepo: origin.ownerRepo,
  };
};
