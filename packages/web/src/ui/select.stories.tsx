import type { Meta, StoryObj } from "@storybook/react-vite";
import { Select } from "./select";

const meta = {
  title: "Core/Select",
  component: Select,
  args: {
    labelledBy: "select-story-label",
    value: "system",
    options: [
      { value: "system", label: "System" },
      { value: "light", label: "Light" },
      { value: "dark", label: "Dark" },
    ],
    onValueChange: () => {},
  },
  decorators: [
    (Story) => (
      <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
        <span id="select-story-label">Interface theme</span>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Select>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Closed: Story = {};
