import type { LinkedDestination } from "@maestro/core";
import { HttpError } from "../api/http";
import type { NoticeCopy } from "../ui/notice";
import { machine, phrase } from "../ui/phrase";
import { LINKED_REASON } from "./reason-copy";

const removeLink = (path: string, again: string) =>
  phrase`Run ${machine(`rm ${path}`)} and ${again}`;

const replaceLink = (path: string, again: string) =>
  phrase`Replace the link at ${machine(path)} with a real folder that contains the same skills, ${again}`;

export const unnamedLink = (again: string) =>
  `One of the target's tool or skill folders is a link. Replace the link with a real folder that contains the same files, ${again}`;

const TOOL_FOLDER_KEEPS_SKILLS =
  "Copy the skills from the folder the link points to into the new folder, so your tools keep every skill.";

const LINK_TARGET_SURVIVES =
  "Deleting the link doesn't delete the folder it points to.";

export function withLinked(
  notice: NoticeCopy,
  error: unknown,
  outcome: string,
  again: string,
): NoticeCopy {
  const linked = linkedOf(error);
  return error instanceof HttpError &&
    error.code === "destination-symlinked" &&
    linked !== undefined
    ? linkedNotice(linked, outcome, again)
    : notice;
}

export function linkedOf(error: unknown): LinkedDestination | undefined {
  if (
    !(error instanceof HttpError) ||
    typeof error.body !== "object" ||
    error.body === null
  ) {
    return undefined;
  }
  const linked: unknown = Reflect.get(error.body, "linked");
  if (typeof linked !== "object" || linked === null) {
    return undefined;
  }
  const kind: unknown = Reflect.get(linked, "kind");
  const path: unknown = Reflect.get(linked, "path");
  return (kind === "tool-folder" || kind === "skill-folder") &&
    typeof path === "string"
    ? { kind, path }
    : undefined;
}

export function linkedNotice(
  linked: LinkedDestination,
  outcome: string,
  again: string,
): NoticeCopy {
  return linked.kind === "tool-folder"
    ? {
        label: LINKED_REASON[linked.kind],
        message: phrase`${outcome} ${replaceLink(linked.path, again)}`,
        detail: TOOL_FOLDER_KEEPS_SKILLS,
      }
    : {
        label: LINKED_REASON[linked.kind],
        message: phrase`${outcome} ${removeLink(linked.path, again)}`,
        detail: LINK_TARGET_SURVIVES,
      };
}
