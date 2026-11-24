export function requestFailure(method, path, error) {
  const cause = error.cause;
  const reason =
    cause === undefined
      ? error.message
      : [cause.code, cause.message].filter(Boolean).join(", ");
  return new Error(
    `${method} ${path} got no answer from the cockpit: ${reason}`,
    {
      cause: error,
    },
  );
}
