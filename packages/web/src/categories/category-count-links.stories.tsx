import type { Meta, StoryObj } from "@storybook/react-vite";
import { MemoryRouter } from "react-router";
import { CategoryCountLinks } from "./category-count-links";

// A Settings › Categories row's counts, each linking to its screen filtered
// to the row.
const meta = {
  title: "Settings/CategoryCountLinks",
  component: CategoryCountLinks,
  args: { name: "Planning", skills: 3, prompts: 2 },
  decorators: [
    (Story) => (
      <MemoryRouter>
        <Story />
      </MemoryRouter>
    ),
  ],
} satisfies Meta<typeof CategoryCountLinks>;

export default meta;

type Story = StoryObj<typeof meta>;

export const SkillsAndPrompts: Story = {};

export const SkillsOnly: Story = { args: { skills: 1, prompts: 0 } };

/** No link: nothing to filter to. */
export const Empty: Story = { args: { skills: 0, prompts: 0 } };
