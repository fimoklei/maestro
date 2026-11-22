export const classifyGitError = <T>(
  error: unknown,
  classify: (stderr: string) => T,
): "offline" | T => {
  if (typeof error !== "object" || error === null) {
    return classify("");
  }
  if ("killed" in error && error.killed === true) {
    return "offline";
  }
  return classify("stderr" in error ? String(error.stderr) : "");
};
