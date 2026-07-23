import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "../ui/button";
import { SkillDetailPane } from "./skill-detail-pane";

// The inventory detail pane's meaningful states: deployed across targets (some
// behind), and the not-deployed-anywhere empty state. The deploy control is a
// static stand-in here — the live one is injected in the app (frontend.md: stories
// carry no hooks).
const meta = {
  title: "Inventory/SkillDetailPane",
  component: SkillDetailPane,
  args: {
    primitive: {
      type: "skill",
      name: "tdd",
      description: "Test-driven development.",
    },
    unconfirmed: false,
    deployAction: (
      <Button variant="ghost" size="sm">
        Deploy →
      </Button>
    ),
    onClose: () => {},
    deployments: [
      { label: "Claude Code", version: "v1.2.0", status: "up-to-date" },
      {
        label: "~/dev/acme-web",
        version: "v1.0.0",
        status: "behind",
        latest: "v1.2.0",
      },
    ],
  },
  decorators: [
    (Story) => (
      <div style={{ height: 420, display: "flex" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SkillDetailPane>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Deployed: Story = {};

export const NotDeployed: Story = {
  args: { deployments: [] },
};

// One target loaded, others still pending or unreadable: the known target shows,
// but the pane warns the reach is not yet complete (J04).
export const PartialReach: Story = {
  args: {
    unconfirmed: true,
    deployments: [
      { label: "Claude Code", version: "v1.2.0", status: "up-to-date" },
    ],
  },
};
