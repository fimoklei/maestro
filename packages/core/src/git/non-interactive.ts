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
