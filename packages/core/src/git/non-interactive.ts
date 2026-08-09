// Ambient credentials only, and no prompt of any kind: `GIT_TERMINAL_PROMPT`
// covers https, and only ssh's BatchMode refuses a passphrase or host-key
// question, which would otherwise hang until the timeout (security.md).
export const NON_INTERACTIVE = {
  GIT_TERMINAL_PROMPT: "0",
  GIT_SSH_COMMAND: "ssh -oBatchMode=yes",
};
