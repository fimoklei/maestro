import type { Meta, StoryObj } from "@storybook/react-vite";
import { SourceLabel } from "./source-label";

// Deep path shortened to its distinguishing tail vs. a short path as-is.
// Presentational, path via args (frontend.md); full path is on hover via title.
const meta = {
  title: "Shell/SourceLabel",
  component: SourceLabel,
  args: {
    path: "/home/me/agent-harness",
  },
} satisfies Meta<typeof SourceLabel>;

export default meta;

type Story = StoryObj<typeof meta>;

// A deep clone path: the shared prefix is dropped, the identifying tail stays
// (#211). Rendered here as "…/me/agent-harness".
export const DeepPath: Story = {};

// A short path has no prefix worth dropping, so it shows in full.
export const ShortPath: Story = { args: { path: "/tmp/x" } };
