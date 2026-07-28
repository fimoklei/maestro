import type { Meta, StoryObj } from "@storybook/react-vite";
import { RemovalTrace } from "./removal-trace";

const meta = {
  title: "DeployState/RemovalTrace",
  component: RemovalTrace,
  args: {
    removed: [
      {
        id: 0,
        name: "tdd",
        version: "v0.5.0",
        target: { kind: "repo", repoPath: "/Users/me/acme-web" },
      },
    ],
  },
} satisfies Meta<typeof RemovalTrace>;

export default meta;

type Story = StoryObj<typeof meta>;

// What one landed removal leaves on the card: the skill, the version that went,
// and the target it went from.
export const OneRemoval: Story = {};

// A global removal names the whole detected set, the same set the confirmation
// asked consent for.
export const GlobalScope: Story = {
  args: {
    removed: [
      {
        id: 0,
        name: "tdd",
        version: "v0.5.0",
        target: { kind: "global", tools: ["claude", "codex"] },
      },
    ],
  },
};

// The trace is cumulative: a card the user cleared out reads back as a list of
// what it held.
export const SeveralRemovals: Story = {
  args: {
    removed: [
      {
        id: 0,
        name: "tdd",
        version: "v0.5.0",
        target: { kind: "repo", repoPath: "/Users/me/acme-web" },
      },
      {
        id: 1,
        name: "code-review",
        version: "v1.2.0",
        target: { kind: "repo", repoPath: "/Users/me/acme-web" },
      },
    ],
  },
};
