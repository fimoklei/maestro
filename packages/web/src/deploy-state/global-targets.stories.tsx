import type { Meta, StoryObj } from "@storybook/react-vite";
import { driftViewModel } from "../drift/drift-view-model";
import { GlobalTargets } from "./global-targets";

// Provider-free: drift stays "ready" so no row needs the Update mutation
// button. "behind" state is covered by the sibling test (frontend.md).
const meta = {
  title: "Shell/GlobalTargets",
  component: GlobalTargets,
  args: {
    isLoading: false,
    isError: false,
    skipped: [],
    drift: driftViewModel({ data: { behind: [] }, isError: false }),
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

// A skill apm materialized under a type Maestro cannot manage: named with its
// recorded type and the one-line recovery, never dropped from the section.
export const UnsupportedDeployment: Story = {
  args: {
    tools: [{ tool: "claude", primitives: [] }],
    skipped: [
      {
        reason: "unsupported-package",
        virtualPath: "skills/tdd",
        packageType: "hybrid",
      },
    ],
  },
};

export const Loading: Story = {
  args: { isLoading: true, tools: [] },
};

export const ReadError: Story = {
  args: { isError: true, tools: [] },
};
