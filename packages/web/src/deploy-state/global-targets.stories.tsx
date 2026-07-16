import type { Meta, StoryObj } from "@storybook/react-vite";
import { GlobalTargets } from "./global-targets";

// The "GLOBAL TARGETS" section in its meaningful read states. Presentational and
// provider-free: every story keeps drift at "ready" with nothing behind, so no
// row renders the Update mutation button (which would need a QueryClient) — the
// behind state is covered in the sibling component test, not here (frontend.md).
const meta = {
  title: "Shell/GlobalTargets",
  component: GlobalTargets,
  args: {
    isLoading: false,
    isError: false,
    skipped: [],
    drift: { status: "ready", behind: [] },
  },
} satisfies Meta<typeof GlobalTargets>;

export default meta;

type Story = StoryObj<typeof meta>;

// One card per detected tool: the tool name headlines, the destination path is
// the secondary detail, and each lists its own deployed skill.
export const PerToolCards: Story = {
  args: {
    tools: [
      {
        tool: "claude",
        primitives: [{ type: "skill", name: "tdd", version: "v0.5.0" }],
      },
      {
        tool: "codex",
        primitives: [{ type: "skill", name: "tdd", version: "v0.5.0" }],
      },
    ],
  },
};

// A detected tool with nothing deployed is an honest empty card, not a missing
// one — a newly installed Codex reads as recognised-but-empty.
export const DetectedButEmpty: Story = {
  args: {
    tools: [
      {
        tool: "claude",
        primitives: [{ type: "skill", name: "tdd", version: "v0.5.0" }],
      },
      { tool: "codex", primitives: [] },
    ],
  },
};

// No supported tool on the machine: an install hint, never empty cards.
export const NoToolDetected: Story = {
  args: { tools: [] },
};

export const Loading: Story = {
  args: { isLoading: true, tools: [] },
};

export const ReadError: Story = {
  args: { isError: true, tools: [] },
};
