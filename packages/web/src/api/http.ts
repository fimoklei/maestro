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
