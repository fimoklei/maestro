import type { Meta, StoryObj } from "@storybook/react-vite";
import { StageTable } from "./stage-table";
import type { HarnessStage, HarnessStageRow, StageStatus } from "./use-harness";

const row = (
  stage: HarnessStage,
  skill: string,
  status: StageStatus,
  over: Partial<HarnessStageRow> = {},
): HarnessStageRow => ({
  stage,
  skill,
  status,
  deletion: false,
  requests: [],
  reviewers: [],
  comparison: stage === "pending-proposal" ? { kind: "default-branch" } : null,
  alsoIn: [],
  concurrentChange: false,
  remoteTree: null,
  previousName: null,
  ...over,
});

const request = (number: number) => ({
  number,
  url: `https://github.com/fimoklei/agent-harness/pull/${number}`,
});

const meta = {
  title: "Harness/StageTable",
  component: StageTable,
  args: {
    title: "Pending proposal",
    context: { defaultBranch: "main", releasedVersion: "v1.4.0" },
    actions: { items: () => [], failed: null },
  },
} satisfies Meta<typeof StageTable>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PendingProposal: Story = {
  args: {
    rows: [
      row("pending-proposal", "tdd", "new-local-work", {
        comparison: { kind: "proposal", number: 45 },
        requests: [request(45)],
        alsoIn: ["pending-review"],
      }),
      row("pending-proposal", "grilling", "not-yet-proposed"),
      row("pending-proposal", "old-skill", "deleted-locally", {
        deletion: true,
      }),
    ],
  },
};

// The row an import confirmation just sent the author to (#846).
export const JustLandedRow: Story = {
  args: {
    rows: [
      row("pending-proposal", "grilling", "not-yet-proposed"),
      row("pending-proposal", "code-review", "not-yet-proposed"),
    ],
    actions: { items: () => [], failed: null, highlight: "code-review" },
  },
};

export const PendingReview: Story = {
  args: {
    title: "Pending review",
    rows: [
      row("pending-review", "tdd", "waiting-for-review", {
        requests: [request(45)],
        reviewers: [
          { kind: "user", login: "ada" },
          { kind: "team", slug: "fimoklei/reviewers" },
        ],
      }),
      row("pending-review", "grilling", "draft", { requests: [request(46)] }),
      row("pending-review", "docs", "changes-requested", {
        requests: [request(47)],
      }),
      row("pending-review", "research", "approved-awaiting-merge", {
        requests: [request(48)],
      }),
      row("pending-review", "lint-rules", "pull-request-missing"),
      row("pending-review", "wayfinder", "proposal-merged", {
        requests: [request(52)],
      }),
      row("pending-review", "spikes", "proposal-closed", {
        requests: [request(30)],
      }),
      row("pending-review", "shipping", "multiple-pull-requests", {
        requests: [request(41), request(44)],
      }),
    ],
  },
};

export const PendingRelease: Story = {
  args: {
    title: "Pending release",
    rows: [
      row("pending-release", "research", "added"),
      row("pending-release", "tdd", "changed"),
      row("pending-release", "grilling", "renamed", {
        previousName: "grill-me",
      }),
      row("pending-release", "old-skill", "deleted", { deletion: true }),
    ],
  },
};
