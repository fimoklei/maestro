import type { Meta, StoryObj } from "@storybook/react-vite";
import { ReleaseDialog } from "./release-dialog";
import type { ReleasePlan } from "./use-harness";

const PLAN: ReleasePlan = {
  delta: [
    { kind: "added", name: "research", author: "Grace" },
    { kind: "changed", name: "tdd", author: "Ada" },
    {
      kind: "renamed",
      name: "test-first",
      previousName: "tdd-legacy",
      author: "Ada",
    },
    { kind: "removed", name: "grilling", author: "Linus" },
  ],
  previousTag: "v1.2.3",
  previousTagCommit: "fedcba9876543210fedcba9876543210fedcba98",
  proposedStep: "major",
  reason: "A skill was removed or renamed.",
  versions: { major: "v2.0.0", minor: "v1.3.0", patch: "v1.2.4" },
  revision: "0123456789abcdef0123456789abcdef01234567",
  defaultBranch: "main",
  findings: [],
};

const meta = {
  title: "Harness/ReleaseDialog",
  component: ReleaseDialog,
  args: {
    origin: "github.com/fimoklei/agent-harness",
    onClose: () => {},
    onPublish: () => {},
    publishing: false,
    publishError: null,
    load: { kind: "ready", plan: PLAN },
  },
} satisfies Meta<typeof ReleaseDialog>;

export default meta;

type Story = StoryObj<typeof meta>;

export const MajorProposed: Story = {};

// The first release: no previous tag, proposed at v0.1.0, everything added.
export const FirstRelease: Story = {
  args: {
    load: {
      kind: "ready",
      plan: {
        ...PLAN,
        previousTag: null,
        proposedStep: "minor",
        reason: "First release.",
        versions: { major: "v1.0.0", minor: "v0.1.0", patch: "v0.0.1" },
        delta: [
          { kind: "added", name: "research", author: "Grace" },
          { kind: "added", name: "tdd", author: "Ada" },
        ],
        findings: [],
      },
    },
  },
};

// Advisory structural findings ride alongside the plan without disabling it.
export const WithFindings: Story = {
  args: {
    load: {
      kind: "ready",
      plan: {
        ...PLAN,
        proposedStep: "patch",
        reason: "Only existing skills changed.",
        delta: [{ kind: "changed", name: "tdd", author: "Ada" }],
        findings: [
          { skill: "grilling", problem: "missing-manifest" },
          { skill: "research", problem: "invalid-frontmatter" },
          { skill: "tdd", problem: "empty-description" },
        ],
      },
    },
  },
};

// Nothing merged since the last release: a quiet plan the author can still
// cut, and one that says so rather than claiming a change.
export const NoChanges: Story = {
  args: {
    load: {
      kind: "ready",
      plan: {
        ...PLAN,
        proposedStep: "patch",
        reason: "Nothing has changed since the last release.",
        delta: [],
        findings: [],
      },
    },
  },
};

export const Loading: Story = {
  args: { load: { kind: "loading" } },
};

export const CouldNotPlan: Story = {
  args: {
    load: {
      kind: "error",
      notice: {
        level: "error",
        label: "No answer from GitHub",
        message: "Press Refresh, then Plan release again.",
        detail: "A release plan is measured against what GitHub holds.",
      },
    },
  },
};

export const Publishing: Story = {
  args: { publishing: true },
};

export const PublishFailed: Story = {
  args: {
    publishError: {
      level: "error",
      label: "Version number taken",
      message:
        "Maestro rebuilt the plan against the newest release. Check it, then Publish release.",
    },
  },
};
