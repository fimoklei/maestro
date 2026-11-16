import type { CategoriesProposalPreview } from "@maestro/core";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { HttpError } from "../api/http";
import {
  PULL_REQUEST_NOT_OPENED,
  pullRequestNotice,
} from "../categories/pull-request-copy";
import { CreatePullRequestDialog } from "./create-pull-request-dialog";

const meta = {
  title: "Settings/CreatePullRequestDialog",
  component: CreatePullRequestDialog,
  args: {
    update: null,
    closed: null,
    preview: {
      kind: "changes",
      added: [{ name: "Review", skills: 2, prompts: 0 }],
      deleted: [],
      moved: [{ type: "skill", name: "tdd", category: "Writing" }],
    },
    failure: null,
    running: false,
    onCreate: () => {},
    onClose: () => {},
  },
} satisfies Meta<typeof CreatePullRequestDialog>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Changes: Story = {};

export const Comparing: Story = { args: { preview: null } };

export const DeletesHarnessCategories: Story = {
  args: {
    preview: {
      kind: "changes",
      added: [],
      deleted: [
        { name: "Debugging", skills: 2, prompts: 1 },
        { name: "Release", skills: 1, prompts: 1 },
      ],
      moved: [],
    },
  },
};

export const MatchesNextRelease: Story = {
  args: { preview: { kind: "unchanged" } },
};

export const CannotCompare: Story = {
  args: { preview: { kind: "uncompared" } },
};

export const Creating: Story = { args: { running: true } };

export const PushFailed: Story = {
  args: {
    failure: pullRequestNotice(
      new HttpError(502, "", "promote-failed"),
      "create",
      null,
    ),
  },
};

export const NotConfirmed: Story = {
  args: {
    failure: pullRequestNotice(new TypeError("fetch failed"), "create", null),
  },
};

export const PushedWithoutPullRequest: Story = {
  args: { failure: PULL_REQUEST_NOT_OPENED },
};

const AFTER_CLOSE = {
  kind: "after-close",
  number: 45,
  deletesBranch: true,
  difference: {
    kind: "changes",
    added: [{ name: "Review", skills: 2, prompts: 0 }],
    deleted: [],
    moved: [],
  },
} satisfies CategoriesProposalPreview;

export const AfterCloseDeletesBranch: Story = {
  args: { closed: 45, preview: AFTER_CLOSE },
};

export const AfterCloseKeepsBranch: Story = {
  args: { closed: 45, preview: { ...AFTER_CLOSE, deletesBranch: false } },
};

export const AfterCloseComparing: Story = {
  args: { closed: 45, preview: null },
};

export const AfterClosePushFailed: Story = {
  args: {
    closed: 45,
    preview: AFTER_CLOSE,
    failure: pullRequestNotice(
      new HttpError(502, "", "push-failed-after-delete"),
      "create",
      45,
    ),
  },
};

export const UpdateChanges: Story = {
  args: {
    update: 45,
    preview: {
      kind: "update",
      number: 45,
      difference: {
        kind: "changes",
        added: [{ name: "Review", skills: 2, prompts: 0 }],
        deleted: [{ name: "Drafts", skills: 0, prompts: 1 }],
        moved: [{ type: "skill", name: "tdd", category: "Writing" }],
      },
      deleted: [],
    },
  },
};

export const UpdateComparing: Story = { args: { update: 45, preview: null } };

export const UpdateDeletesHarnessCategories: Story = {
  args: {
    update: 45,
    preview: {
      kind: "update",
      number: 45,
      difference: {
        kind: "changes",
        added: [],
        deleted: [{ name: "Debugging", skills: 2, prompts: 0 }],
        moved: [],
      },
      deleted: [{ name: "Debugging", skills: 2, prompts: 0 }],
    },
  },
};

export const UpdateMatchesPullRequest: Story = {
  args: {
    update: 45,
    preview: {
      kind: "update",
      number: 45,
      difference: { kind: "unchanged" },
      deleted: [],
    },
  },
};

export const UpdateCannotCompare: Story = {
  args: {
    update: 45,
    preview: {
      kind: "update",
      number: 45,
      difference: { kind: "uncompared" },
      deleted: [],
    },
  },
};

export const Updating: Story = {
  args: { ...UpdateChanges.args, running: true },
};

export const UpdateFailed: Story = {
  args: {
    ...UpdateChanges.args,
    failure: pullRequestNotice(
      new HttpError(502, "", "promote-failed"),
      "update",
      null,
    ),
  },
};
