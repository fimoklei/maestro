// Thin fetch wrapper: returns typed JSON and throws on a non-2xx response so
// TanStack Query sees an error (see .claude/rules/frontend.md). Components never
// call fetch directly; they go through the resource hooks that build on this.

export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
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
    } | null;
    throw new HttpError(
      res.status,
      body?.message ?? `Request failed with status ${res.status}.`,
    );
  }

  return res.json() as Promise<T>;
}
