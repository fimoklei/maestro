import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./button";
import { SectionHeader } from "./section-header";

const meta = {
  title: "Shell/SectionHeader",
  component: SectionHeader,
  args: { title: "Deploy-state", meta: "read from lockfiles · 3 targets" },
} satisfies Meta<typeof SectionHeader>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithAction: Story = {
  args: { title: "Central inventory", meta: "curated · production-ready" },
  render: (args) => (
    <SectionHeader {...args}>
      <Button variant="primary">+ new primitive</Button>
    </SectionHeader>
  ),
};
