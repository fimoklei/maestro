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
      {
        type: "skill",
        name: "code-review",
        change: "addition",
        seenRemoteTree: null,
      },
      {
        type: "skill",
        name: "commit-message",
        change: "addition",
        seenRemoteTree: null,
      },
      { type: "skill", name: "tdd", change: "edit", seenRemoteTree: null },
      {
        type: "prompt",
        name: "release-notes",
        change: "addition",
        seenRemoteTree: null,
      },
    ],
    origin: "fimoklei/agent-harness",
    confirming: false,
    running: true,
    report: null,
    failure: null,
    onConfirm: () => {},
    onClose: () => {},
  },
} satisfies Meta<typeof ProposeBatchDialog>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Running: Story = {};

// A batch with a deletion waits on its confirmation before it runs.
export const Confirming: Story = {
  args: {
    items: [
      {
        type: "skill",
        name: "code-review",
        change: "addition",
        seenRemoteTree: null,
      },
      { type: "skill", name: "tdd", change: "edit", seenRemoteTree: null },
      {
        type: "skill",
        name: "legacy-review",
        change: "deletion",
        seenRemoteTree: "9f2c1b7a",
      },
      {
        type: "skill",
        name: "old-deploy",
        change: "deletion",
        seenRemoteTree: "4b7e0d2c",
      },
    ],
    confirming: true,
    running: false,
  },
};

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
