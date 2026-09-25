type ErrorStatus = 400 | 403 | 404 | 409 | 422 | 500 | 502 | 503;

// A status only: every sentence lives in its feature copy module in `packages/web`.
export type ErrorTable<TCode extends string> = Record<
  TCode,
  { status: ErrorStatus }
>;
