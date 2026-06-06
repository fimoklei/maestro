// Guards state-changing routes against DNS-rebinding / CSRF: a malicious site
// open in the browser POSTing to localhost to drive the machine. Requires a
// JSON body, an allowlisted Host header, and a present, allowlisted Origin.
// Enabled via a createApp dep — production always on, tests construct it off;
// there is no static bypass header (see .claude/rules/security.md).
import type { MiddlewareHandler } from "hono";

const ALLOWED_HOSTNAMES = new Set(["127.0.0.1", "localhost"]);

function hostHeaderHostname(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  try {
    // A Host header has no scheme ("127.0.0.1:3000"); wrap it to parse uniformly.
    return new URL(`http://${value}`).hostname;
  } catch {
    return null;
  }
}

function originHostname(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

export const originHostGuard: MiddlewareHandler = async (c, next) => {
  const contentType = c.req.header("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return c.json(
      {
        error: "unsupported-media-type",
        message: "Expected a Content-Type of application/json.",
      },
      415,
    );
  }

  const host = hostHeaderHostname(c.req.header("host"));
  if (host === null || !ALLOWED_HOSTNAMES.has(host)) {
    return c.json(
      { error: "forbidden-host", message: "Request host is not allowed." },
      403,
    );
  }

  const origin = originHostname(c.req.header("origin"));
  if (origin === null || !ALLOWED_HOSTNAMES.has(origin)) {
    return c.json(
      { error: "forbidden-origin", message: "Request origin is not allowed." },
      403,
    );
  }

  await next();
};
