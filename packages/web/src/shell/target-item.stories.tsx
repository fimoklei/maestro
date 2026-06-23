import type { Meta, StoryObj } from "@storybook/react-vite";
import { TargetItem } from "./target-item";

const meta = {
  title: "Shell/TargetItem",
  component: TargetItem,
  args: { label: "/Users/me/app", kind: "local", indicator: "ok" },
  argTypes: {
    kind: { control: "inline-radio", options: ["global", "local"] },
    indicator: {
      control: "inline-radio",
      options: ["ok", "drift", "unknown", "pending"],
    },
  },
  // A target row is a list item; wrap it so the story renders valid markup.
  decorators: [
    (Story) => (
      <ul style={{ width: 280 }}>
        <Story />
      </ul>
    ),
  ],
} satisfies Meta<typeof TargetItem>;

export default meta;

type Story = StoryObj<typeof meta>;

export const InSync: Story = {
  args: { label: "Global", kind: "global", indicator: "ok" },
};

export const NeedsUpdate: Story = { args: { indicator: "drift" } };

export const Unknown: Story = { args: { indicator: "unknown" } };

export const Checking: Story = { args: { indicator: "pending" } };
