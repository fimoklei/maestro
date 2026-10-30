import type { Meta, StoryObj } from "@storybook/react-vite";
import { AddCategoryDialog } from "./add-category-dialog";

const meta = {
  title: "Settings/AddCategoryDialog",
  component: AddCategoryDialog,
  args: {
    name: "",
    onNameChange: () => {},
    error: undefined,
    failure: null,
    busy: false,
    onAdd: () => {},
    onClose: () => {},
  },
} satisfies Meta<typeof AddCategoryDialog>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Empty: Story = {};

export const EmptyNameRefused: Story = {
  args: { error: "Enter a name." },
};

export const NameExists: Story = {
  args: { name: "code review", error: "Code review already exists." },
};

export const Adding: Story = { args: { name: "Docs", busy: true } };
