import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "../ui/button";
import { HarnessStrip } from "./harness-strip";

const meta = {
  title: "Harness/HarnessStrip",
  component: HarnessStrip,
  args: {
    releasedVersion: "v0.5.0",
    defaultBranch: "main",
    status: "Read just now",
    children: (
      <Button variant="quiet" size="sm">
        Retry check
      </Button>
    ),
  },
} satisfies Meta<typeof HarnessStrip>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Read: Story = {};

// No network reached the remote, so the picture has an age and says so.
export const Offline: Story = {
  args: { status: "Offline — last read 1 h ago" },
};

// A reply that said no. Held apart from Offline, and never worded as a
// permission gate Maestro would be inventing (#516).
export const ReadFailed: Story = {
  args: { status: "Read failed — never read" },
};

export const NeverReleased: Story = {
  args: { releasedVersion: null, status: "Read just now" },
};
