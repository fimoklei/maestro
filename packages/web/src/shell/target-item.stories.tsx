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
    driftCount: { control: "number" },
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
  args: { label: "Claude Code", kind: "global", indicator: "ok" },
};

// A target with two deployed skills behind the latest — the `▲N` drift badge.
export const NeedsUpdate: Story = {
  args: {
    label: "Claude Code",
    kind: "global",
    indicator: "drift",
    driftCount: 2,
  },
};

// Nothing deployed here yet — the first-run reading of a freshly-registered
// repo. Neutral, not a problem: distinct from "unknown" (a check that failed).
export const Empty: Story = { args: { indicator: "empty" } };

// The target follows one release and a newer one exists: the Release head's
// reading, which the per-skill drift check cannot give (ADR-0031, #956).
export const BehindRelease: Story = {
  args: { indicator: "ok", behind: true, changedCount: 2 },
};

// The same target where the newer release touched nothing it selected — still
// behind, with no count to show.
export const BehindNothingChanged: Story = {
  args: { indicator: "ok", behind: true, changedCount: 0 },
};

// Still deployed one skill at a time: no release was adopted here, so no drift
// reading is this target's status (#950).
export const PinnedPerSkill: Story = {
  args: { indicator: "ok", pinnedPerSkill: true },
};

export const Unknown: Story = { args: { indicator: "unknown" } };

// apm reached the tool but could not resolve against the remote (no auth/network)
// — distinct from a crashed check, and never read as in sync.
export const Unverified: Story = { args: { indicator: "unverified" } };

export const Checking: Story = { args: { indicator: "pending" } };
