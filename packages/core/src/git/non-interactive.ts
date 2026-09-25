import { devNull } from "node:os";

// No prompt of any kind: without BatchMode an ssh passphrase or host-key
// question hangs until the timeout. `LC_ALL` keeps git's failure phrases
// untranslated, so they classify.
export const NON_INTERACTIVE = {
  GIT_TERMINAL_PROMPT: "0",
  GIT_SSH_COMMAND: "ssh -oBatchMode=yes",
  LC_ALL: "C",
};

export const gitOptions = () => ({
  env: { ...process.env, ...NON_INTERACTIVE },
  timeout: 60_000,
});

// A throwaway index, so nothing stages in the author's own (#574).
export const indexOptions = (indexFile: string) => {
  const options = gitOptions();
  return { ...options, env: { ...options.env, GIT_INDEX_FILE: indexFile } };
};

// The author's hooks may write in the working tree or fail after a push
// landed, so none run. Passed as `-c`, not `GIT_CONFIG_*`, which would drop
// config the caller's env already carries (#574).
export const NO_HOOKS = ["-c", `core.hooksPath=${devNull}`];
