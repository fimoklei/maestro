import type { Meta, StoryObj } from "@storybook/react-vite";
import { MemoryRouter } from "react-router";
import { HarnessCategoriesSection } from "./harness-categories-section";
import { PullRequestRow } from "./pull-request-row";

const PULL = "https://github.com/fimoklei/agent-harness/pull";

// Pressing Create pull request opens a dialog that reads the server; its
// story is `Settings/CreatePullRequestDialog`.
const meta = {
  title: "Settings/HarnessCategoriesSection",
  component: HarnessCategoriesSection,
  args: {
    harness: { kind: "listed", tag: "v1.5.0", count: 6 },
    children: <PullRequestRow row={{ state: "start" }} report={() => {}} />,
  },
  decorators: [
    (Story) => (
      <MemoryRouter>
        <div style={{ maxWidth: 640 }}>
          <Story />
        </div>
      </MemoryRouter>
    ),
  ],
} satisfies Meta<typeof HarnessCategoriesSection>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Listed: Story = {};

export const NoCategories: Story = { args: { harness: { kind: "none" } } };

export const FileWithAnError: Story = {
  args: { harness: { kind: "faulty", tag: "v1.5.0" } },
};

export const EmptyOwnList: Story = {
  args: {
    children: <PullRequestRow row={{ state: "empty" }} report={() => {}} />,
  },
};

export const OverTheLimits: Story = {
  args: {
    children: (
      <PullRequestRow row={{ state: "over-limits" }} report={() => {}} />
    ),
  },
};

export const HarnessNotRead: Story = {
  args: {
    children: <PullRequestRow row={{ state: "unread" }} report={() => {}} />,
  },
};

export const AnotherContributorsPullRequest: Story = {
  args: {
    children: (
      <PullRequestRow
        row={{
          state: "waiting-on-other",
          author: "mira",
          number: 46,
          url: `${PULL}/46`,
        }}
        report={() => {}}
      />
    ),
  },
};

export const WaitingForReview: Story = {
  args: {
    children: (
      <PullRequestRow
        row={{
          state: "own-open",
          status: "waiting-for-review",
          number: 45,
          url: `${PULL}/45`,
        }}
        report={() => {}}
      />
    ),
  },
};

export const ChangesRequested: Story = {
  args: {
    children: (
      <PullRequestRow
        row={{
          state: "own-open",
          status: "changes-requested",
          number: 45,
          url: `${PULL}/45`,
        }}
        report={() => {}}
      />
    ),
  },
};
