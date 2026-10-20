import type { HarnessPrimitiveType } from "@maestro/core";

// Control labels that a sentence names, shared so the sentence and the
// control cannot drift apart.
export const COPY_PROMPT = "Copy prompt";
export const CREATE_RELEASE = "Create a release";
export const DELETE_PROMPT = "Delete prompt";
export const DELETE_SKILL = "Delete skill";
export const DEPLOY_SKILL = "Deploy skill";
export const DISCARD_CHANGE = "Discard change";
export const IMPORT_LOCAL_EDITS = "Import local edits";
export const IMPORT_SKILL = "Import skill";
export const PROPOSE_CHANGE = "Propose change";
export const PUBLISH_RELEASE = "Publish release";
export const REGISTER_REPOSITORY = "Register repository";
export const REMOVE_SKILL = "Remove skill";
const RESTORE_PROMPT = "Restore prompt";
export const RESTORE_SKILL = "Restore skill";
export const UPDATE_SKILL = "Update skill";
export const UPDATE_TARGET = "Update target";
export const UPDATE_TARGETS = "Update targets";
export const VIEW_DEPLOY_STATE = "View Deploy-state";

/** A screen's own Re-read control, named by the screen. */
export const rereadLabel = (screen: string) => `Re-read ${screen}`;

/** Each type's own delete control. */
export const DELETE_LABEL: Record<HarnessPrimitiveType, string> = {
  skill: DELETE_SKILL,
  prompt: DELETE_PROMPT,
};

/** Each type's own restore control. */
export const RESTORE_LABEL: Record<HarnessPrimitiveType, string> = {
  skill: RESTORE_SKILL,
  prompt: RESTORE_PROMPT,
};
