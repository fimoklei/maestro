import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./button";

const meta = {
  title: "Core/Button",
  component: Button,
  args: { variant: "primary", size: "md", children: "deploy →" },
  argTypes: {
    variant: {
      control: "inline-radio",
      options: ["primary", "success", "ghost", "quiet", "dashed"],
    },
    size: { control: "inline-radio", options: ["sm", "md", "lg"] },
  },
} satisfies Meta<typeof Button>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Primary: Story = {};

export const AllVariants: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <Button variant="primary">deploy →</Button>
      <Button variant="success">confirm</Button>
      <Button variant="ghost">deploy →</Button>
      <Button variant="quiet">cancel</Button>
      <Button variant="dashed">+ register repo</Button>
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <Button size="sm">update</Button>
      <Button size="md">deploy →</Button>
      <Button size="lg">deploy all targets</Button>
    </div>
  ),
};

export const Disabled: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <Button variant="primary">deploy →</Button>
        <Button variant="success">confirm</Button>
        <Button variant="ghost">deploy →</Button>
        <Button variant="quiet">cancel</Button>
        <Button variant="dashed">+ register repo</Button>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <Button variant="primary" disabled>
          deploy →
        </Button>
        <Button variant="success" disabled>
          confirm
        </Button>
        <Button variant="ghost" disabled>
          deploy →
        </Button>
        <Button variant="quiet" disabled>
          cancel
        </Button>
        <Button variant="dashed" disabled>
          + register repo
        </Button>
      </div>
    </div>
  ),
};
