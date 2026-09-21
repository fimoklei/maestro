// Every busy label and done sentence the cockpit uses (#1026). One owner, not
// one per feature: `Deploying…` is the Inventory's word and Deploy-state's.

export type ActionKey =
  | "deploy"
  | "update"
  | "remove"
  | "delete"
  | "restore"
  | "propose"
  | "withdraw"
  | "reopen"
  | "create"
  | "import"
  | "register"
  | "unregister"
  | "scaffold"
  | "connect"
  | "setLocation";

// `busy` is the verb of the control's own label with no object; `done` is the
// word the status region ends on. Paired so neither can drift from the other.
export const ACTIONS: Record<ActionKey, { busy: string; done: string }> = {
  deploy: { busy: "Deploying…", done: "Deployed" },
  update: { busy: "Updating…", done: "Updated" },
  remove: { busy: "Removing…", done: "Removed" },
  delete: { busy: "Deleting…", done: "Deleted" },
  restore: { busy: "Restoring…", done: "Restored" },
  propose: { busy: "Proposing…", done: "Proposed" },
  withdraw: { busy: "Withdrawing…", done: "Withdrew" },
  reopen: { busy: "Reopening…", done: "Reopened" },
  create: { busy: "Creating…", done: "Created" },
  import: { busy: "Importing…", done: "Imported" },
  register: { busy: "Registering…", done: "Registered" },
  unregister: { busy: "Unregistering…", done: "Unregistered" },
  scaffold: { busy: "Scaffolding…", done: "Scaffolded" },
  connect: { busy: "Connecting…", done: "Connected" },
  setLocation: { busy: "Setting…", done: "Set" },
};

/** What the screen's status region says once a write lands. */
export function doneSentence(action: ActionKey, name: string): string {
  return `${ACTIONS[action].done} ${name}.`;
}

/** Heard while the skeleton is up, never seen outside a dialog. */
export function loadingText(screenName: string): string {
  return `Loading the ${screenName}…`;
}

export function loadedText(screenName: string): string {
  return `${screenName} loaded.`;
}
