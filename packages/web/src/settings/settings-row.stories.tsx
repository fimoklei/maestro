import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "../ui/button";
import { SettingsRow } from "./settings-row";

const meta = {
  title: "Settings/SettingsRow",
  component: SettingsRow,
  args: { name: "Local clone", value: "/Users/me/Projects/agent-harness" },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 640 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SettingsRow>;

export default meta;

type Story = StoryObj<typeof meta>;

export const MachineValue: Story = {};

// A plain word is never set in Geist Mono.
export const PlainValue: Story = {
  args: {
    name: "GitHub repository",
    value: "GitHub repository not read",
    machine: false,
  },
};

export const WithControl: Story = {
  args: {
    name: "Change Harness location",
    description: "Point Maestro at another local Harness clone.",
    value: undefined,
    control: <Button variant="quiet">Change Harness location</Button>,
  },
};
