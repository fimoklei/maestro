import type { Meta, StoryObj } from "@storybook/react-vite";
import { MemoryRouter } from "react-router";
import { TextLink } from "./text-link";

const meta = {
  title: "Core/TextLink",
  component: TextLink,
  args: {
    to: "/inventory/skills?category=Planning",
    label: "3 skills in Planning",
    children: "3 skills",
  },
  render: (args) => (
    <MemoryRouter>
      <p className="font-ui text-gray-11 text-row">
        <TextLink {...args} /> · 2 prompts
      </p>
    </MemoryRouter>
  ),
} satisfies Meta<typeof TextLink>;

export default meta;

type Story = StoryObj<typeof meta>;

// A Settings count: the words say how many, the name says where it leads.
export const Count: Story = {};
