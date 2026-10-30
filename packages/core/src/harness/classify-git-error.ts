// A run we cut off got no answer, so it is offline, never a reply.
export const classifyGitError = <T>(
  error: unknown,
  classify: (stderr: string) => T,
): "offline" | T => {
  const killed = (error as { killed?: boolean }).killed === true;
  return killed
    ? "offline"
    : classify(String((error as { stderr?: string }).stderr));
};
