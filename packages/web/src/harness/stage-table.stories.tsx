import type { Meta, StoryObj } from "@storybook/react-vite";
import { rowItems } from "./row-actions";
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
  localOnly: false,
  remoteTree: null,
  restorable: false,
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
    actions: {
      items: () => [],
      failed: null,
      highlight: { stage: "pending-proposal", skill: "code-review" },
    },
  },
};

// The two notices a row can carry, side by side: one painted with the row, one
// answering a refused press. Both sit in the Detail column without a fill or an
// outline, so neither reads as a card inside the card (DESIGN.md §6).
export const RowsCarryingANotice: Story = {
  args: {
    rows: [
      row("pending-proposal", "agent-native-cli", "not-yet-proposed", {
        concurrentChange: true,
      }),
      row("pending-proposal", "grilling", "not-yet-proposed"),
    ],
    actions: {
      items: () => [],
      failed: {
        row: { stage: "pending-proposal", skill: "grilling" },
        notice: {
          level: "error",
          label: "No answer from GitHub",
          message:
            "Nothing was pushed. Select Retry check, then Propose change again.",
        },
      },
    },
  },
};

// The one story whose menus are built, not stubbed: its sentences name the
// labels the menu carries, and a stub would hide a mismatch (#883).
const NO_OP = {
  promote: () => {},
  create: () => {},
  reopen: () => {},
  withdraw: () => {},
  deleteLocal: () => {},
  restore: () => {},
};

export const PendingReview: Story = {
  args: {
    title: "Pending review",
    actions: {
      items: (row) => rowItems(row, NO_OP, true),
      failed: null,
    },
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
      row("pending-review", "old-skill", "draft", {
        deletion: true,
        requests: [request(49)],
      }),
      row("pending-review", "legacy-skill", "approved-awaiting-merge", {
        deletion: true,
        requests: [request(50)],
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
