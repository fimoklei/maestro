import type { Meta, StoryObj } from "@storybook/react-vite";
import { DetailPane } from "./detail-pane";

const meta = {
  title: "Core/DetailPane",
  component: DetailPane,
  args: {
    title: "diagnose",
    activeKey: "diagnose",
    position: { index: 6, count: 36 },
    onPage: () => {},
    onClose: () => {},
    getTriggerElement: () => null,
    initialFocus: null,
    facts: [
      { label: "Type", value: "Skill" },
      { label: "Targets", value: 2 },
    ],
    paragraph: ["Loop for hard bugs and slow paths."],
    foot: [
      { label: "Deploy skill", onSelect: () => {} },
      { label: "Remove from all 2 targets", danger: true, onSelect: () => {} },
    ],
    leadsWithNextStep: true,
  },
  decorators: [
    (Story) => (
      <div style={{ height: 480, display: "flex" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DetailPane>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

// The table hides the open row, so there is no place to state.
export const Unplaced: Story = { args: { position: null } };

// An unfinished operation: its notice's retry takes the one primary.
export const Retry: Story = {
  args: {
    leadsWithNextStep: false,
    notices: [
      {
        content: {
          level: "warning",
          label: "Deploy incomplete",
          message: "The deploy stopped part way.",
          action: { label: "Retry deploy", onClick: () => {} },
        },
        trigger: "load",
        retry: true,
      },
    ],
  },
};
