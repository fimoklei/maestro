// The pages of Settings, in the order its sidebar lists them (#995). One owner,
// because the sidebar and the narrow bar's menu both navigate by it.

export interface SettingsPage {
  to: string;
  /** The page name. */
  label: string;
}

export const HARNESS_LOCATION_PAGE: SettingsPage = {
  to: "/settings/harness-location",
  label: "Harness location",
};

export const APPEARANCE_PAGE: SettingsPage = {
  to: "/settings/appearance",
  label: "Appearance",
};

export const SETTINGS_PAGES: readonly SettingsPage[] = [
  HARNESS_LOCATION_PAGE,
  APPEARANCE_PAGE,
];
