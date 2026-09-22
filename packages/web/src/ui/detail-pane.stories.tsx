import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./button";
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
    actions: <Button size="sm">Deploy skill</Button>,
    children: (
      <p className="m-0 text-gray-11 text-prose">
        Loop for hard bugs and slow paths.
      </p>
    ),
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
