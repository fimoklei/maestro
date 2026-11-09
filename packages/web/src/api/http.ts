// Throws on a non-2xx response so TanStack Query sees an error.

export class HttpError extends Error {
  readonly status: number;
  readonly code?: string;
  // Unvalidated: reading past `message` and `code` is the caller's job.
  readonly body?: unknown;

  constructor(status: number, message: string, code?: string, body?: unknown) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

export async function requestJson<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });

  if (!res.ok) {
    throw await httpError(res);
  }

  return res.json() as Promise<T>;
}

async function httpError(res: Response): Promise<HttpError> {
  const body = (await res.json().catch(() => null)) as {
    message?: string;
    error?: string;
  } | null;
  return new HttpError(
    res.status,
    body?.message ?? `Request failed with status ${res.status}.`,
    body?.error,
    body,
  );
}

/**
 * A streamed answer of one JSON value per line: each line as it arrives. `T`
 * must be the type the route writes each line as (`BatchLine` from
 * `@maestro/core` on both sides), as `requestJson` trusts its route's answer.
 */
export async function requestJsonLines<T>(
  path: string,
  init: RequestInit,
  onLine: (line: T) => void,
): Promise<void> {
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...init.headers },
  });
  if (!res.ok) {
    throw await httpError(res);
  }
  if (res.body === null) return;
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let pending = "";
  for (;;) {
    const { done, value } = await reader.read();
    pending += value ?? "";
    const lines = pending.split("\n");
    pending = done ? "" : (lines.pop() ?? "");
    for (const line of lines) {
      // Cast: each line is one `JSON.stringify` of the route's `T`.
      if (line.trim() !== "") onLine(JSON.parse(line) as T);
    }
    if (done) return;
  }
}
