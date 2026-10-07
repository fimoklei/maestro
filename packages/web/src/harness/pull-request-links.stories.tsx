import type { Meta, StoryObj } from "@storybook/react-vite";
import { PullRequestLinks } from "./pull-request-links";
import { pullRequest, stageRow } from "./stage-row-fixture";

const meta = {
  title: "Harness/PullRequestLinks",
  component: PullRequestLinks,
  args: {
    row: stageRow("pending-review", "code-review", "changes-requested", {
      requests: [pullRequest(47, "code-review")],
      reviewers: [
        { kind: "user", login: "sanne" },
        { kind: "user", login: "joris" },
      ],
    }),
  },
} satisfies Meta<typeof PullRequestLinks>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OneRequest: Story = {};

export const SeveralRequests: Story = {
  args: {
    row: stageRow("pending-review", "show-me", "multiple-pull-requests", {
      requests: [pullRequest(51, "show-me"), pullRequest(52, "show-me")],
    }),
  },
};

export const NoRequest: Story = {
  args: {
    row: stageRow("pending-proposal", "wizard", "not-yet-proposed"),
  },
};
