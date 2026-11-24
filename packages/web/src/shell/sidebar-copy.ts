import { joinNames } from "../deploy-state/join-names";
import { rereadLabel } from "../ui/control-labels";

export const behindCount = (count: number): string => `${count} behind`;
export const pendingCount = (count: number): string => `${count} pending`;

/** A failed read: `?` on screen, the word for a screen reader. */
export const UNKNOWN_COUNT = { shown: "?", spoken: "Unknown" } as const;

/** The logo's link name: its visible word, then where it leads. */
export const LOGO_LINK = "Maestro, Deploy-state";

export const unreadTargetsDetail = (
  targets: readonly string[],
  registryUnread: boolean,
): string =>
  `Couldn't read ${joinNames([
    ...targets,
    ...(registryUnread ? ["the list of registered repositories"] : []),
  ])}. Select ${rereadLabel("Deploy-state")} on the Deploy-state screen.`;
