// The words of the shared GitHub column.

import { rereadLabel } from "./control-labels";

export const GITHUB_COLUMN = "GitHub";
export const viewOnGitHub = (name: string) => `View ${name} on GitHub`;
/** A fact's value is its own link, so its name starts with that value. */
export const factOnGitHub = (value: string) => `${value} on GitHub`;
/** The column's keyboard way to the same page, as a ⋮ item. */
export const VIEW_REPOSITORY_ON_GITHUB = "View repository on GitHub";
/** The cause behind the column's Unknown badge, recovered by the screen's own Re-read. */
export const originNotRead = (screen: string) =>
  `The origin of this repository could not be read. Select ${rereadLabel(screen)} to read it again.`;
