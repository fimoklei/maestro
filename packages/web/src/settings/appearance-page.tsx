import { useId, useState } from "react";
import { Select } from "../ui/select";
import {
  chooseInterfaceTheme,
  parseInterfaceTheme,
  readInterfaceTheme,
} from "./interface-theme";
import {
  INTERFACE_THEME,
  INTERFACE_THEME_LABELS,
  INTERFACE_THEME_SENTENCE,
  THEME,
} from "./settings-copy";
import { APPEARANCE_PAGE } from "./settings-pages";
import { SettingsPanel } from "./settings-panel";
import { SettingsRow } from "./settings-row";
import { SettingsSection } from "./settings-section";

const OPTIONS = Object.entries(INTERFACE_THEME_LABELS).map(
  ([value, label]) => ({ value, label }),
);

// The page for how the cockpit looks (#995): its one row, Interface theme
// (#996). The choice lives in this browser only.
export function AppearancePage() {
  const nameId = useId();
  const [choice, setChoice] = useState(readInterfaceTheme);

  const choose = (value: string) => {
    const next = parseInterfaceTheme(value);
    chooseInterfaceTheme(next);
    setChoice(next);
  };

  return (
    <SettingsPanel title={APPEARANCE_PAGE.label}>
      <SettingsSection title={THEME}>
        <SettingsRow
          name={INTERFACE_THEME}
          nameId={nameId}
          description={INTERFACE_THEME_SENTENCE}
          control={
            <Select
              labelledBy={nameId}
              value={choice}
              options={OPTIONS}
              onValueChange={choose}
            />
          }
        />
      </SettingsSection>
    </SettingsPanel>
  );
}
