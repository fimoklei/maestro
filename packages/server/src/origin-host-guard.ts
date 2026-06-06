// Guards state-changing routes against DNS-rebinding / CSRF: a malicious site
// open in the browser POSTing to localhost to drive the machine. Requires a
// JSON body, an allowlisted Host header, and a present, allowlisted Origin.
// Enabled via a createApp dep — production always on, tests construct it off;
// there is no static bypass header (see .claude/rules/security.md).
import type { MiddlewareHandler } from "hono";

const ALLOWED_HOSTNAMES = new Set(["127.0.0.1", "localhost"]);

// Extracts the hostname from a header value, or null when absent/unparseable.
// A Host header carries no scheme ("127.0.0.1:3000"), so it is parsed with one
// assumed; an Origin already includes its scheme. One parser keeps the Host and
// Origin checks from drifting apart.
function headerHostname(
  value: string | undefined,
  { assumeScheme }: { assumeScheme: boolean },
): string | null {
  if (!value) {
    return null;
  }
  try {
    return new URL(assumeScheme ? `http://${value}` : value).hostname;
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

  const host = headerHostname(c.req.header("host"), { assumeScheme: true });
  if (host === null || !ALLOWED_HOSTNAMES.has(host)) {
    return c.json(
      { error: "forbidden-host", message: "Request host is not allowed." },
      403,
    );
  }

  const origin = headerHostname(c.req.header("origin"), {
    assumeScheme: false,
  });
  if (origin === null || !ALLOWED_HOSTNAMES.has(origin)) {
    return c.json(
      { error: "forbidden-origin", message: "Request origin is not allowed." },
      403,
    );
  }

  await next();
};
