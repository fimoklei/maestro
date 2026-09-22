import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./button";
import { SelectionBar } from "./selection-bar";

// Positioned against its panel, so each story gives it one to float in.
const meta = {
  title: "Core/SelectionBar",
  component: SelectionBar,
  args: {
    count: 3,
    onClear: () => {},
    children: (
      <Button variant="primary" size="sm">
        Deploy skills
      </Button>
    ),
  },
  decorators: [
    (Story) => (
      <div style={{ position: "relative", height: 160 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SelectionBar>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

// Some chosen rows are off screen: the bar says how many.
export const HiddenByTheFilter: Story = { args: { hiddenCount: 1 } };
