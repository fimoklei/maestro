import type { Meta, StoryObj } from "@storybook/react-vite";
import { TypeTag } from "./type-tag";

const meta = {
  title: "Core/TypeTag",
  component: TypeTag,
  args: { type: "skill" },
  argTypes: {
    type: {
      control: "inline-radio",
      options: ["skill", "hook", "mcp", "bundle"],
    },
  },
} satisfies Meta<typeof TypeTag>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Skill: Story = {};

export const AllTypes: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 8 }}>
      <TypeTag type="skill" />
      <TypeTag type="hook" />
      <TypeTag type="mcp" />
      <TypeTag type="bundle" />
    </div>
  ),
};
