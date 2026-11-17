import {
  COPY_FAILED_HEADING,
  RELEASE_UNREAD,
} from "../categories/categories-copy";
import { FIRST_INVENTORY_VIEW } from "../inventory/inventory-views";
import { primitiveCountLabel } from "../shell/primitive-count-label";
import type { NoticeContent } from "../ui/notice";

export const WELCOME_TITLE = "No Harness connected";
export const WELCOME_BODY =
  "Connect a Harness to see its skills, hooks and MCP servers.";
export const CONNECT_HARNESS = "Connect Harness";

export const CONNECT_TITLE = "Connect a Harness";
export const PATH_LABEL = "Harness folder or GitHub URL";
export const CLONE_HINT =
  "Maestro adds one new folder here and changes nothing else.";
export const CLONE_WAIT = "Cloning can take a minute.";
export const CLONE_LABEL = "Folder for the Harness";

export const CONNECTED_TITLE = "Harness connected";
export const CONTINUE_TO_FIRST_VIEW = `Continue to ${FIRST_INVENTORY_VIEW.name}`;
export const CREATED_TITLE = "Harness created";
export const CONTINUE_TO_HARNESS = "Continue to Harness";

export const PRIVATE_HARNESS_ACCESS =
  "Teammates need their own GitHub and APM access to a private Harness.";
export const NO_SKILLS_YET = "It has no skills yet.";

/** The hint under the Copy Harness categories checkbox. */
export const COPY_LATER_HINT =
  "You can also copy them later in Categories in Settings.";

/** Why the copy on Continue to Skills did not land, stated on Skills after the move; Skills offers no control for any cause, so each points to Settings. */
export const connectCopyFailed = (code: string | null): NoticeContent => ({
  level: "error",
  label: COPY_FAILED_HEADING,
  message:
    code === "no-harness-categories"
      ? "The latest Harness release has no categories Maestro can copy. You can add your own in Categories in Settings."
      : code === "harness-categories-unread"
        ? `${RELEASE_UNREAD} You can copy the categories later in Categories in Settings.`
        : "You can copy them later in Categories in Settings.",
});

// Null is a count that could not be read: left out, never shown as zero (#841).
export function connectedMessage(count: number | null): string {
  if (count === null) return "The Harness is ready in the Inventory.";
  return `${primitiveCountLabel(count)} ${count === 1 ? "is" : "are"} ready in the Inventory.`;
}
