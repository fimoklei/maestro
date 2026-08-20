// The one shape every server error table has.

/** The statuses the server answers refusals with. */
export type ErrorStatus = 400 | 403 | 404 | 409 | 422 | 500 | 502;

export type ErrorTable<TCode extends string> = Record<
  TCode,
  { status: ErrorStatus; message: string }
>;
