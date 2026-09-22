import type { Meta, StoryObj } from "@storybook/react-vite";
import type { HarnessTableRow } from "./harness-columns";
import { rowId } from "./harness-columns";
import { promoteNotice } from "./notice-copy";
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
        requests: [pullRequest(47)],
        alsoIn: ["pending-review"],
      }),
      [
        { label: "Update proposal", onSelect: () => {} },
        { label: "View pull request", href: pullRequest(47).url },
      ],
    ),
    context: { defaultBranch: "main", releasedVersion: "v1.4.0" },
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
