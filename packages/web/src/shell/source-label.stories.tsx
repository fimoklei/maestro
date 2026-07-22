import type { Meta, StoryObj } from "@storybook/react-vite";
import { SourceLabel } from "./source-label";

// The connected source block in the two states that read differently: a deep
// path that gets shortened to its distinguishing tail, and a short path that
// stands as-is. Presentational and provider-free — takes the path through args
// (frontend.md). The full path is always on hover via the native title.
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
