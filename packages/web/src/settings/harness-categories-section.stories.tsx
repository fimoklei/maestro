import type { Meta, StoryObj } from "@storybook/react-vite";
import { HarnessCategoriesSection } from "./harness-categories-section";

const meta = {
  title: "Settings/HarnessCategoriesSection",
  component: HarnessCategoriesSection,
  args: { harness: { kind: "listed", tag: "v1.5.0", count: 6 } },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 640 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof HarnessCategoriesSection>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Listed: Story = {};

export const FileWithAnError: Story = {
  args: { harness: { kind: "faulty", tag: "v1.5.0" } },
};
