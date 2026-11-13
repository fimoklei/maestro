import type { Meta, StoryObj } from "@storybook/react-vite";
import { AnchoredFloat } from "./anchored-float";
import { Button } from "./button";
import { CategoryMenu } from "./category-menu";

const NAMES = ["Code review", "Harness maintenance", "Planning", "Writing"];

const menu = (
  <CategoryMenu
    label="Set category for be-ambitious"
    names={NAMES}
    current={null}
    onPick={() => {}}
    onAdd={() => {}}
    onClose={() => {}}
  />
);

const meta = {
  title: "Core/AnchoredFloat",
  component: AnchoredFloat,
  args: {
    open: true,
    width: "menu",
    anchor: <Button variant="quiet">No category</Button>,
    children: menu,
  },
  decorators: [
    (Story) => (
      <div style={{ display: "flex", justifyContent: "flex-end", width: 560 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AnchoredFloat>;

export default meta;

type Story = StoryObj<typeof meta>;

/** A 240px menu, aligned to the control's end, as a checklist row opens it. */
export const FromRowControl: Story = {};

/** Closed: only the control shows. */
export const Closed: Story = { args: { open: false } };
