// Every busy label and done sentence the cockpit uses (#1026).

import { type Copy, type Phrase, phrase } from "./phrase";

export type ActionKey =
  | "deploy"
  | "update"
  | "remove"
  | "delete"
  | "restore"
  | "discard"
  | "propose"
  | "withdraw"
  | "reopen"
  | "create"
  | "publish"
  | "import"
  | "register"
  | "unregister"
  | "scaffold"
  | "connect"
  | "setLocation";

export const ACTIONS: Record<ActionKey, { busy: string; done: string }> = {
  deploy: { busy: "Deploying…", done: "Deployed" },
  update: { busy: "Updating…", done: "Updated" },
  remove: { busy: "Removing…", done: "Removed" },
  delete: { busy: "Deleting…", done: "Deleted" },
  restore: { busy: "Restoring…", done: "Restored" },
  // "Discarded tdd." would read as the whole skill gone (#1375).
  discard: { busy: "Discarding…", done: "Discarded change to" },
  propose: { busy: "Proposing…", done: "Proposed" },
  withdraw: { busy: "Withdrawing…", done: "Withdrew" },
  reopen: { busy: "Reopening…", done: "Reopened" },
  create: { busy: "Creating…", done: "Created" },
  publish: { busy: "Publishing…", done: "Published" },
  import: { busy: "Importing…", done: "Imported" },
  register: { busy: "Registering…", done: "Registered" },
  unregister: { busy: "Unregistering…", done: "Unregistered" },
  scaffold: { busy: "Scaffolding…", done: "Scaffolded" },
  connect: { busy: "Connecting…", done: "Connected" },
  setLocation: { busy: "Setting…", done: "Set" },
};

/** Every refusal of a Harness write while another one runs, on any screen. */
export const HARNESS_BUSY = "Harness busy";

/** What the screen's status region says once a write lands. */
export function doneSentence(action: ActionKey, name: Copy): Phrase {
  return phrase`${ACTIONS[action].done} ${name}.`;
}

/** Heard while the skeleton is up, never seen outside a dialog. */
export function loadingText(screenName: string): string {
  return `Loading the ${screenName}…`;
}

export function loadedText(screenName: string): string {
  return `${screenName} loaded.`;
}
