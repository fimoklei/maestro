import type { Meta, StoryObj } from "@storybook/react-vite";
import { Card } from "../ui/card";
import { MovementTable } from "./movement-table";

const meta = {
  title: "Harness/MovementTable",
  component: MovementTable,
  // The view always frames a section's rows in a card; the table alone would
  // document an edge it never has.
  decorators: [
    (Story) => (
      <Card>
        <Story />
      </Card>
    ),
  ],
} satisfies Meta<typeof MovementTable>;

export default meta;

type Story = StoryObj<typeof meta>;

export const PendingReview: Story = {
  args: {
    movements: [
      {
        skill: "code-review",
        state: "pending-review",
        deletion: false,
        concurrentChange: false,
        remoteTree: null,
      },
      {
        skill: "test-helper",
        state: "pending-review",
        deletion: false,
        concurrentChange: false,
        remoteTree: null,
      },
    ],
  },
};

export const PendingPromotion: Story = {
  args: {
    movements: [
      {
        skill: "lint-rules",
        state: "pending-promotion",
        deletion: false,
        concurrentChange: false,
        remoteTree: null,
      },
      {
        skill: "tdd",
        state: "pending-promotion",
        deletion: true,
        concurrentChange: false,
        remoteTree: null,
      },
    ],
  },
};

// Promotion's four readings on one screen: the press, the wait, the link a
// pushed skill carries, and the refusal that leaves the press available. A
// deletion has no press — publishing a removal takes its own confirmation.
const promotable = {
  onPromote: () => {},
  enabled: true,
  pending: null,
  pullRequests: {},
  justPromoted: null,
  failed: null,
};

export const Promotable: Story = {
  args: {
    movements: [
      {
        skill: "lint-rules",
        state: "pending-promotion",
        deletion: false,
        concurrentChange: false,
        remoteTree: null,
      },
      {
        skill: "tdd",
        state: "pending-promotion",
        deletion: true,
        concurrentChange: false,
        remoteTree: null,
      },
    ],
    promote: promotable,
  },
};

// A teammate already changed this skill on GitHub, past local HEAD.
// Advisory, not a gate: the press stays there beside it (#579).
export const ConcurrentChange: Story = {
  args: {
    movements: [
      {
        skill: "lint-rules",
        state: "pending-promotion",
        deletion: false,
        concurrentChange: true,
        remoteTree: null,
      },
    ],
    promote: promotable,
  },
};

export const PromoteInFlight: Story = {
  args: {
    movements: [
      {
        skill: "lint-rules",
        state: "pending-promotion",
        deletion: false,
        concurrentChange: false,
        remoteTree: null,
      },
      {
        skill: "code-review",
        state: "pending-promotion",
        deletion: false,
        concurrentChange: false,
        remoteTree: null,
      },
    ],
    promote: { ...promotable, pending: "lint-rules" },
  },
};

export const Promoted: Story = {
  args: {
    movements: [
      {
        skill: "lint-rules",
        state: "pending-review",
        deletion: false,
        concurrentChange: false,
        remoteTree: null,
      },
    ],
    promote: {
      ...promotable,
      pullRequests: {
        "lint-rules":
          "https://github.com/fimoklei/agent-harness/compare/main...maestro/lint-rules?expand=1",
      },
    },
  },
};

export const PromoteRefused: Story = {
  args: {
    movements: [
      {
        skill: "lint-rules",
        state: "pending-promotion",
        deletion: false,
        concurrentChange: false,
        remoteTree: null,
      },
    ],
    promote: {
      ...promotable,
      failed: {
        skill: "lint-rules",
        message:
          "The skill could not be pushed. Check the remote and try again.",
      },
    },
  },
};

// Closed while the remote's answer is unknown, on the rule that closes Release.
export const PromoteClosed: Story = {
  args: {
    movements: [
      {
        skill: "lint-rules",
        state: "pending-promotion",
        deletion: false,
        concurrentChange: false,
        remoteTree: null,
      },
    ],
    promote: { ...promotable, enabled: false },
  },
};

// A name long enough to overflow the narrow table must still leave room for the
// deletion chip: the name truncates, the chip stays (#575).
export const LongNameDeletion: Story = {
  args: {
    movements: [
      {
        skill: "a-very-long-unbroken-skill-name-that-would-overflow-the-cell",
        state: "pending-promotion",
        deletion: true,
        concurrentChange: false,
        remoteTree: null,
      },
    ],
  },
};
