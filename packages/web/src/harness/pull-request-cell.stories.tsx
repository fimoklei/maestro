import type { Meta, StoryObj } from "@storybook/react-vite";
import { PullRequestCell } from "./pull-request-cell";
import { pullRequest, stageRow } from "./stage-row-fixture";

const meta = {
  title: "Harness/PullRequestCell",
  component: PullRequestCell,
  args: {
    row: stageRow("pending-review", "code-review", "changes-requested", {
      requests: [pullRequest(47)],
      reviewers: [
        { kind: "user", login: "sanne" },
        { kind: "user", login: "joris" },
      ],
    }),
  },
} satisfies Meta<typeof PullRequestCell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OneRequest: Story = {};

export const SeveralRequests: Story = {
  args: {
    row: stageRow("pending-review", "show-me", "multiple-pull-requests", {
      requests: [pullRequest(51), pullRequest(52)],
    }),
  },
};

export const NoRequest: Story = {
  args: {
    row: stageRow("pending-proposal", "wizard", "not-yet-proposed"),
  },
};
