import { primitiveCountLabel } from "../shell/primitive-count-label";

export const WELCOME_TITLE = "No Harness connected";
export const WELCOME_BODY =
  "Connect a Harness to see its skills, hooks and MCP servers.";
export const CONNECT_HARNESS = "Connect Harness";

export const CONNECT_TITLE = "Connect a Harness";
export const PATH_LABEL = "Harness folder or GitHub URL";
export const CLONE_HINT =
  "Maestro adds one new folder here and changes nothing else.";
export const CLONE_WAIT = "Cloning can take a minute.";

export const PRIVATE_HARNESS_ACCESS =
  "Teammates need their own GitHub and APM access to a private Harness.";
export const NO_SKILLS_YET = "It has no skills yet.";

// Null is a count that could not be read: left out, never shown as zero (#841).
export function connectedMessage(count: number | null): string {
  if (count === null) return "The Harness is ready in the Inventory.";
  return `${primitiveCountLabel(count)} ${count === 1 ? "is" : "are"} ready in the Inventory.`;
}
