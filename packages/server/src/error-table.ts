// The one shape every server error table has.

/** The statuses the server answers refusals with. */
type ErrorStatus = 400 | 403 | 404 | 409 | 422 | 500 | 502 | 503;

// A status and nothing else: every sentence lives in its feature copy module
// in `packages/web` (ADR-0025, #681). The request-shape messages are the
// only prose the server still writes.
export type ErrorTable<TCode extends string> = Record<
  TCode,
  { status: ErrorStatus }
>;
