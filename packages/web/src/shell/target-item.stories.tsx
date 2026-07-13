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
      options: ["ok", "drift", "empty", "unknown", "unverified", "pending"],
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

// Nothing deployed here yet — the first-run reading of a freshly-registered
// repo. Neutral, not a problem: distinct from "unknown" (a check that failed).
export const Empty: Story = { args: { indicator: "empty" } };

export const Unknown: Story = { args: { indicator: "unknown" } };

// apm reached the tool but could not resolve against the remote (no auth/network)
// — distinct from a crashed check, and never read as in sync.
export const Unverified: Story = { args: { indicator: "unverified" } };

export const Checking: Story = { args: { indicator: "pending" } };
