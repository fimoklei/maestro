// Guards against DNS rebinding and CSRF. No static bypass header.
import type { MiddlewareHandler } from "hono";

const ALLOWED_HOSTNAMES = new Set(["127.0.0.1", "localhost"]);

// Host carries no scheme ("127.0.0.1:3000"), so one is assumed; Origin
// already has its own.
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
