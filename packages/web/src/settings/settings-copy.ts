import type { ConnectInventoryError } from "@maestro/core";

// The words of Settings and its Harness location page (#995). Control and
// page names come from CONTEXT.md.

export const SETTINGS = "Settings";
export const BACK_TO_APP = "Back to app";
/** A sidebar group heading, not a page name. */
export const PERSONAL = "Personal";

export const CONNECTED_HARNESS = "Connected Harness";
export const LOCAL_CLONE = "Local clone";
export const GITHUB_REPOSITORY = "GitHub repository";
export const GITHUB_NOT_READ = "GitHub repository not read";
export const LATEST_RELEASE = "Latest release";

export const LOCATION = "Location";
export const CHANGE_LOCATION = "Change Harness location";
export const CHANGE_LOCATION_SENTENCE =
  "Point Maestro at another local Harness clone.";

// The dialog: title and confirm share the verb Set (copy.md → Dialog).
export const SET_LOCATION = "Set Harness location";
export const FOLDER_LABEL = "Folder path";
export const FOLDER_HINT = "Must be a local Harness clone.";
export const CANCEL = "Cancel";

// The dialog takes a folder only, so its refusals never offer a URL: these
// replace the connect gate's sentences for the same codes.
export const SET_LOCATION_MESSAGES: Partial<
  Record<ConnectInventoryError, string>
> = {
  missing: "Type the path to a local Harness clone.",
  "not-an-inventory": "Choose a folder that holds a Harness.",
};

export function setLocationMessage(code: string | null): string | undefined {
  return (SET_LOCATION_MESSAGES as Record<string, string | undefined>)[
    code ?? ""
  ];
}
