// Control labels that a sentence names, shared so the sentence and the
// control cannot drift apart.
export const CREATE_RELEASE = "Create a release";
export const DELETE_SKILL = "Delete skill";
export const DEPLOY_SKILL = "Deploy skill";
export const DISCARD_CHANGE = "Discard change";
export const IMPORT_LOCAL_EDITS = "Import local edits";
export const IMPORT_SKILL = "Import skill";
export const PROPOSE_CHANGE = "Propose change";
export const PUBLISH_RELEASE = "Publish release";
export const REGISTER_REPOSITORY = "Register repository";
export const REMOVE_SKILL = "Remove skill";
export const RESTORE_SKILL = "Restore skill";
export const UPDATE_SKILL = "Update skill";
export const UPDATE_TARGET = "Update target";
export const UPDATE_TARGETS = "Update targets";
export const VIEW_DEPLOY_STATE = "View Deploy-state";

/** A screen's own Re-read control, named by the screen. */
export const rereadLabel = (screen: string) => `Re-read ${screen}`;
