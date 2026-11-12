import type { Meta, StoryObj } from "@storybook/react-vite";
import { RowCategoryControl } from "./row-category-control";

// The Category control on an Import skills or Import prompts checklist row.
// The menu it opens is `Core/CategoryMenu`.
const meta = {
  title: "Harness/RowCategoryControl",
  component: RowCategoryControl,
  args: {
    name: "code-review",
    value: null,
    open: false,
    disabled: false,
    buttonRef: undefined,
    onToggle: () => {},
  },
} satisfies Meta<typeof RowCategoryControl>;

export default meta;

type Story = StoryObj<typeof meta>;

export const NoCategory: Story = {};

/** The file named a category the list holds. */
export const WithCategory: Story = { args: { value: "Code review" } };

/** A long category name truncates inside the control. */
export const LongCategory: Story = {
  args: { value: "Release engineering and deployment tooling" },
};

export const MenuOpen: Story = { args: { value: "Docs", open: true } };

/** Locked while the import runs. */
export const Importing: Story = { args: { disabled: true } };
