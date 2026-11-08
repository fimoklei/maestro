import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProposeBatchDialog } from "./propose-batch-dialog";

const pullRequest = (number: number) => ({
  state: "opened" as const,
  number,
  url: `https://github.com/fimoklei/agent-harness/pull/${number}`,
});

const meta = {
  title: "Harness/ProposeBatchDialog",
  component: ProposeBatchDialog,
  args: {
    items: [
      { type: "skill", name: "code-review", change: "addition" },
      { type: "skill", name: "commit-message", change: "addition" },
      { type: "skill", name: "tdd", change: "edit" },
      { type: "prompt", name: "release-notes", change: "addition" },
    ],
    running: true,
    report: null,
    failure: null,
    onClose: () => {},
  },
} satisfies Meta<typeof ProposeBatchDialog>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Running: Story = {};

// One push failed; the rest each opened or updated its pull request.
export const Reported: Story = {
  args: {
    running: false,
    report: {
      proposed: [
        {
          type: "skill",
          name: "code-review",
          branch: "maestro/code-review",
          compareUrl: "",
          pullRequest: pullRequest(214),
        },
        {
          type: "skill",
          name: "tdd",
          branch: "maestro/tdd",
          compareUrl: "",
          pullRequest: { ...pullRequest(12), state: "updated" },
        },
        {
          type: "prompt",
          name: "release-notes",
          branch: "maestro/prompt.release-notes",
          compareUrl: "",
          pullRequest: pullRequest(215),
        },
      ],
      failed: [
        {
          error: "promote-failed",
          items: [{ type: "skill", name: "commit-message" }],
        },
      ],
    },
  },
};

// Another Harness write held the lock: nothing ran.
export const Refused: Story = {
  args: {
    running: false,
    failure: {
      level: "error",
      label: "Harness busy",
      message:
        "Wait for that change to finish, then select Propose changes again.",
    },
  },
};
