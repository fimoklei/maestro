import type { Meta, StoryObj } from "@storybook/react-vite";
import { SettingsPanel } from "./settings-panel";
import { SettingsRow } from "./settings-row";
import { SettingsSection } from "./settings-section";

const meta = {
  title: "Settings/SettingsPanel",
  component: SettingsPanel,
  args: { title: "Harness location" },
  decorators: [
    (Story) => (
      <div style={{ height: 480 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SettingsPanel>;

export default meta;

type Story = StoryObj<typeof meta>;

// A page with its heading only, as Appearance is until its row lands.
export const Empty: Story = { args: { title: "Appearance" } };

export const WithSection: Story = {
  args: {
    children: (
      <SettingsSection title="Location">
        <SettingsRow
          name="Local clone"
          value="/Users/me/Projects/agent-harness"
        />
      </SettingsSection>
    ),
  },
};
