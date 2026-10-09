import type { Meta, StoryObj } from "@storybook/react-vite";
import { skillMark } from "../deploy-state/skill-mark";
import { ReachCard } from "./reach-card";

const UP_TO_DATE = skillMark(undefined, "up-to-date");

// The card's content alone; HoverCard's own story shows it floating.
const meta = {
  title: "Inventory/ReachCard",
  component: ReachCard,
  args: {
    count: 4,
    unreadable: false,
    deployments: [
      { label: "Global", release: "v1.4.0", mark: UP_TO_DATE },
      {
        label: "maestro",
        release: "v1.3.2",
        mark: skillMark("local-edits", "behind"),
      },
      {
        label: "agent-harness",
        release: "v1.3.2",
        mark: skillMark(undefined, "behind"),
      },
      { label: "site", release: "v1.4.0", mark: UP_TO_DATE },
    ],
  },
  decorators: [
    (Story) => (
      <div className="w-72 rounded-float border border-gray-7 bg-gray-2 p-cell text-meta">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ReachCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const MoreThanShown: Story = {};

export const NotDeployed: Story = { args: { count: 0, deployments: [] } };

export const TargetNotRead: Story = {
  args: {
    count: 1,
    unreadable: true,
    deployments: [
      {
        label: "Global",
        release: "v1.4.0",
        mark: skillMark(undefined, "unknown"),
      },
    ],
  },
};
