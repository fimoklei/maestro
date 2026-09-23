import { APPEARANCE_PAGE } from "./settings-pages";
import { SettingsPanel } from "./settings-panel";

// The page for how the cockpit looks (#995). Its one row, Interface theme, is
// #996's.
export function AppearancePage() {
  return <SettingsPanel title={APPEARANCE_PAGE.label} />;
}
