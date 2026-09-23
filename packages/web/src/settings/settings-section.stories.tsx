import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "../ui/button";
import { SettingsRow } from "./settings-row";
import { SettingsSection } from "./settings-section";

const meta = {
  title: "Settings/SettingsSection",
  component: SettingsSection,
  args: {
    title: "Connected Harness",
    children: (
      <>
        <SettingsRow
          name="Local clone"
          value="/Users/me/Projects/agent-harness"
        />
        <SettingsRow name="GitHub repository" value="fimoklei/agent-harness" />
        <SettingsRow name="Latest release" value="v1.4.0 · 36 skills" />
      </>
    ),
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 640 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SettingsSection>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Plain: Story = { args: { action: undefined } };

// The action sits beside the facts it refreshes (#995).
export const WithAction: Story = {
  args: { action: <Button variant="quiet">Re-read Inventory</Button> },
};
