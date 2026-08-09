// The child folder a pasted GitHub url would clone into, for display beside
// the chosen parent (#555). Display only: the server re-classifies the input
// and is the authority on what Maestro will clone. It is repeated here rather
// than imported because `web` may take types from `core`, never values
// (architecture.md).

// The scp-like ssh form; the capture is everything after the colon.
const SCP_LIKE = /^[^/\s]+@([^/\s:]+):(.+)$/;

const GITHUB_HOST = "github.com";

export function previewCloneChild(input: string): string | null {
  const trimmed = input.trim().replace(/\/+$/, "");
  const parts = splitHostAndPath(trimmed);
  if (parts === null || parts.host.toLowerCase() !== GITHUB_HOST) {
    return null;
  }
  const segments = parts.path
    .replace(/\.git$/, "")
    .split("/")
    .filter((segment) => segment.length > 0);
  return segments.length === 2 ? (segments[1] ?? null) : null;
}

function splitHostAndPath(
  input: string,
): { host: string; path: string } | null {
  if (input.includes("://")) {
    try {
      const url = new URL(input);
      // Both are refused by the server, so neither may be shown a
      // destination it will never clone into (core's `parseGitOrigin`).
      if (url.username !== "" || url.password !== "" || url.port !== "") {
        return null;
      }
      return { host: url.hostname, path: url.pathname };
    } catch {
      return null;
    }
  }
  const scp = SCP_LIKE.exec(input);
  return scp?.[1] === undefined || scp[2] === undefined
    ? null
    : { host: scp[1], path: scp[2] };
}
