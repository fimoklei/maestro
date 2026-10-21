import type { Meta, StoryObj } from "@storybook/react-vite";
import { DataTableName } from "./data-table-name";

const meta = {
  title: "Core/DataTableName",
  component: DataTableName,
  args: { name: "tdd", mark: null },
  decorators: [
    (Story) => (
      <div style={{ width: 160 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DataTableName>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Fits: Story = {};

// Hover the name: the tooltip shows it whole.
export const Shortened: Story = {
  args: { name: "…/clientA/repos/agent-harness-with-a-long-name" },
};

// A finding's glyph before the name: a badly named prompt file.
export const WithFinding: Story = {
  args: {
    name: "Review_PR",
    mark: { word: "Name not valid", family: "attention", glyph: "⚠" },
  },
};
