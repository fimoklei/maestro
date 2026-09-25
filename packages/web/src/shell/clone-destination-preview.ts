// Display only (#555): the server decides what Maestro clones. Repeated from
// `core` because `web` may import only types from it.

// The scp-like ssh form; the capture is everything after the colon.
const SCP_LIKE = /^[^/\s]+@([^/\s:]+):(.+)$/;

const GITHUB_HOST = "github.com";

const DEFAULT_PORTS: Record<string, string> = { "https:": "443", "ssh:": "22" };

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
      // Refused by the server. `URL` blanks a default port for https but not
      // ssh, so a port counts only when it is not the transport's default.
      if (
        url.username !== "" ||
        url.password !== "" ||
        (url.port !== "" && url.port !== DEFAULT_PORTS[url.protocol])
      ) {
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
