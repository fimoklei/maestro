import { devNull } from "node:os";

// Ambient credentials only, and no prompt of any kind: `GIT_TERMINAL_PROMPT`
// covers https, and only ssh's BatchMode refuses a passphrase or host-key
// question, which would otherwise hang until the timeout (security.md).
// `LC_ALL` pins the locale so a failure is classified on the phrases git was
// read for, not on a translation of them (`classify-clone-failure.ts`).
export const NON_INTERACTIVE = {
  GIT_TERMINAL_PROMPT: "0",
  GIT_SSH_COMMAND: "ssh -oBatchMode=yes",
  LC_ALL: "C",
};

// Resolve ambient env per invocation. A stalled Git operation must end.
export const gitOptions = () => ({
  env: { ...process.env, ...NON_INTERACTIVE },
  timeout: 60_000,
});

// The same options pointed at a throwaway index, so a command that stages
// anything writes there and never in the author's own (#574).
export const indexOptions = (indexFile: string) => {
  const options = gitOptions();
  return { ...options, env: { ...options.env, GIT_INDEX_FILE: indexFile } };
};

// The author's hooks are theirs, and these commands promise to leave the
// checkout alone: a `pre-push` hook is free to write in the working tree, or to
// fail after the remote already took the push. `devNull` is a hooks directory
// git finds nothing in, so none of them run. Passed as `-c` rather than through
// `GIT_CONFIG_*`, which would silently drop config the caller's env already
// carries (#574).
export const NO_HOOKS = ["-c", `core.hooksPath=${devNull}`];
