// The words of the shared GitHub column (design.md → Frame, ADR-0025).

export const GITHUB_COLUMN = "GitHub";
export const viewOnGitHub = (name: string) => `View ${name} on GitHub`;
/** A fact's value is its own link, so its name starts with that value. */
export const factOnGitHub = (value: string) => `${value} on GitHub`;
