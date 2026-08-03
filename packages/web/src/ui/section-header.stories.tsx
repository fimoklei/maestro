import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./button";
import { SectionHeader } from "./section-header";

const meta = {
  title: "Shell/SectionHeader",
  component: SectionHeader,
  args: { title: "Deploy-state", meta: "3 targets" },
} satisfies Meta<typeof SectionHeader>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

// The connect gate opts into h1: it is its own document, not a section of the
// cockpit (ADR-0015). Visually identical to Default — the difference is the
// document outline, which is what the level prop exists to fix.
export const AsPageTitle: Story = {
  args: {
    level: 1,
    title: "Connect central inventory",
    meta: "the path of a local agent-harness clone",
  },
};

// A heading inside a view, for a view built from more than one part. It drops
// to the Subtitle step, so rank and weight agree and the view title stays the
// heaviest thing on screen.
export const InsideAView: Story = {
  args: {
    level: 3,
    title: "Global targets",
    meta: "2 detected",
  },
};

export const WithAction: Story = {
  args: { title: "Central inventory", meta: "curated · production-ready" },
  render: (args) => (
    <SectionHeader {...args}>
      <Button variant="primary">+ new primitive</Button>
    </SectionHeader>
  ),
};
