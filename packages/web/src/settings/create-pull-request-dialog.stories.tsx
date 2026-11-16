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
    failure: pullRequestNotice(new HttpError(502, "", "promote-failed")),
  },
};

export const NotConfirmed: Story = {
  args: { failure: pullRequestNotice(new TypeError("fetch failed")) },
};

export const PushedWithoutPullRequest: Story = {
  args: { failure: PULL_REQUEST_NOT_OPENED },
};
