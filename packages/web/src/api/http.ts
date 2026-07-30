// Thin fetch wrapper: returns typed JSON and throws on a non-2xx response so
// TanStack Query sees an error (see .claude/rules/frontend.md). Components never
// call fetch directly; they go through the resource hooks that build on this.

export class HttpError extends Error {
  readonly status: number;
  // The server's typed error code (e.g. "deployed-diverged-from-lock"), when it
  // sends one. Lets a component branch on the *kind* of refusal — to offer a
  // confirmed-reinstall affordance, say — without string-matching the message.
  readonly code?: string;
  // The error response's whole parsed body, for a failure that carries more
  // than a code and a sentence. Unvalidated — reading past `message` and `code`
  // is the caller's job.
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
    const body = (await res.json().catch(() => null)) as {
      message?: string;
      error?: string;
    } | null;
    throw new HttpError(
      res.status,
      body?.message ?? `Request failed with status ${res.status}.`,
      body?.error,
      body,
    );
  }

  return res.json() as Promise<T>;
}
