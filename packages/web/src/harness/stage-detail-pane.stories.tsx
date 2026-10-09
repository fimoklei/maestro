import type { Meta, StoryObj } from "@storybook/react-vite";
import type { HarnessTableRow } from "./harness-columns";
import { rowId } from "./harness-columns";
import { promoteNotice } from "./notice-copy";
import { rowItems } from "./row-actions";
import { statusReading } from "./stage-copy";
import { StageDetailPane } from "./stage-detail-pane";
import { pullRequest, stageRow } from "./stage-row-fixture";

const tableRow = (
  row: ReturnType<typeof stageRow>,
  items: HarnessTableRow["items"],
): HarnessTableRow => ({
  ...row,
  id: rowId(row),
  group: "Pending proposal",
  reading: statusReading(row),
  items,
});

const meta = {
  title: "Harness/StageDetailPane",
  component: StageDetailPane,
  args: {
    row: tableRow(
      stageRow("pending-proposal", "code-review", "new-local-work", {
        comparison: { kind: "proposal", number: 47 },
        requests: [pullRequest(47, "code-review")],
        alsoIn: ["pending-review"],
      }),
      [
        { label: "Update proposal", onSelect: () => {} },
        { label: "View pull request", href: pullRequest(47).url },
      ],
    ),
    context: {
      defaultBranch: "main",
      releasedVersion: "v1.4.0",
      origin: "github.com/fimoklei/agent-harness",
    },
    failure: null,
    position: { index: 1, count: 16 },
    onPage: () => {},
    onClose: () => {},
    getTriggerElement: () => null,
  },
  decorators: [
    (Story) => (
      <div style={{ height: 560, display: "flex" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof StageDetailPane>;

export default meta;
type Story = StoryObj<typeof meta>;

export const UpdateProposal: Story = {};

// A teammate's newer change stands on the default branch.
export const ConcurrentChange: Story = {
  args: {
    row: tableRow(
      stageRow("pending-proposal", "tdd", "not-yet-proposed", {
        concurrentChange: true,
      }),
      [{ label: "Propose change", onSelect: () => {} }],
    ),
  },
};

// A refused press, stated where it was made.
export const RefusedPress: Story = {
  args: {
    row: tableRow(stageRow("pending-proposal", "tdd", "not-yet-proposed"), [
      { label: "Propose change", onSelect: () => {} },
    ]),
    failure: promoteNotice(new Error("offline")),
  },
};

// A skill that exists nowhere else: Delete skill stands apart, in red.
export const LocalOnly: Story = {
  args: {
    row: tableRow(
      stageRow("pending-proposal", "wizard", "not-yet-proposed", {
        localOnly: true,
      }),
      [
        { label: "Propose change", onSelect: () => {} },
        { label: "Delete skill", danger: true, onSelect: () => {} },
      ],
    ),
  },
};

const noop = () => {};
const withMenu = (row: ReturnType<typeof stageRow>) =>
  tableRow(
    row,
    rowItems(
      row,
      {
        promote: noop,
        create: noop,
        reopen: noop,
        withdraw: noop,
        deleteLocal: noop,
        discard: noop,
        restore: noop,
      },
      true,
      { enabled: true, commit: "local-head" },
      null,
    ),
  );

const closedDeletion = (folderOnDisk: boolean) => ({
  ...withMenu(
    stageRow("pending-review", "wizard", "proposal-closed", {
      change: "deletion",
      requests: [pullRequest(52, "wizard")],
      folderOnDisk,
      restorable: !folderOnDisk,
    }),
  ),
  group: "Pending review",
});

const theirs = {
  ...pullRequest(47, "code-review"),
  author: "sanne",
  byOther: true,
};

// Another contributor's open request: only its link, and a wait (#1373).
export const ProposedByOther: Story = {
  args: {
    row: {
      ...withMenu(
        stageRow("pending-review", "code-review", "proposed-by-other", {
          requests: [theirs],
          waitingOn: "sanne",
          alsoIn: ["pending-proposal"],
        }),
      ),
      group: "Pending review",
    },
  },
};

// Local work behind it stays local: Delete skill remains.
export const WaitingLocalWork: Story = {
  args: {
    row: withMenu(
      stageRow("pending-proposal", "code-review", "new-local-work", {
        comparison: { kind: "proposal", number: 47 },
        requests: [theirs],
        waitingOn: "sanne",
        remoteTree: "remote-code-review",
        folderOnDisk: true,
        alsoIn: ["pending-review"],
      }),
    ),
  },
};

// A closed deletion: Reopen proposal while the folder is still deleted (#1384).
export const ClosedDeletion: Story = {
  args: { row: closedDeletion(false) },
};

// The author restored the folder: no press would act, so none is offered.
export const ClosedDeletionRestored: Story = {
  args: { row: closedDeletion(true) },
};
