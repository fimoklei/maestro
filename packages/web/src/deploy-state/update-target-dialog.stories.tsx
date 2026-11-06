import type { UpdatePreview } from "@maestro/core";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { HttpError } from "../api/http";
import { globalUpdateNotice, updatePreviewNotice } from "./notice-copy";
import { UpdateTargetDialog } from "./update-target-dialog";

const row = (name: string) => ({
  name,
  url: `https://github.com/fimoklei/agent-harness/tree/v0.3.4/.apm/skills/${name}`,
});

const PREVIEW: UpdatePreview = {
  release: "v0.3.2",
  chosenRelease: "v0.3.4",
  counts: { changed: 2, removed: 1, unchanged: 3 },
  addedByThisDeploy: [],
  changed: [row("tdd"), row("jobs")],
  removed: ["review"],
  unchanged: ["grill", "brief", "worktree"],
  newInRelease: [row("wizard")],
  localEdits: { discard: [], unverified: [] },
  selection: {
    current: ["tdd", "jobs", "review", "grill", "brief", "worktree"],
    desired: ["tdd", "jobs", "grill", "brief", "worktree"],
  },
  copyReceipt: null,
  token: "a".repeat(64),
};

const meta = {
  title: "DeployState/UpdateTargetDialog",
  component: UpdateTargetDialog,
  args: {
    targetName: "agent-harness",
    folders: null,
    preview: PREVIEW,
    isLoading: false,
    error: null,
    blocked: false,
    onCancel: () => {},
    onConfirm: () => {},
  },
} satisfies Meta<typeof UpdateTargetDialog>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Priced: Story = {};

export const NoContentChanges: Story = {
  args: {
    preview: {
      ...PREVIEW,
      counts: { changed: 0, removed: 0, unchanged: 3 },
      changed: [],
      removed: [],
      selection: {
        current: ["grill", "brief", "worktree"],
        desired: ["grill", "brief", "worktree"],
      },
    },
  },
};

const GLOBAL_FOLDERS = [
  { path: "~/.claude/skills", tool: "claude", detected: true },
  { path: "~/.agents/skills", tool: "codex", detected: true },
] as const;

export const Global: Story = {
  args: { targetName: "Global", folders: GLOBAL_FOLDERS },
};

export const GlobalCodexNotDetected: Story = {
  args: {
    targetName: "Global",
    folders: [GLOBAL_FOLDERS[0], { ...GLOBAL_FOLDERS[1], detected: false }],
  },
};

export const ConsentRequired: Story = {
  args: {
    targetName: "Global",
    folders: GLOBAL_FOLDERS,
    preview: {
      ...PREVIEW,
      localEdits: {
        discard: [{ name: "tdd", tool: "claude" }],
        unverified: [{ name: "jobs", tool: "codex" }],
      },
      copyReceipt: "b".repeat(64),
    },
  },
};

export const BecomesEmpty: Story = {
  args: {
    preview: {
      ...PREVIEW,
      counts: { changed: 0, removed: 1, unchanged: 0 },
      changed: [],
      unchanged: [],
      removed: ["review"],
      selection: { current: ["review"], desired: [] },
    },
  },
};

export const AddedByThisDeploy: Story = {
  args: {
    preview: {
      ...PREVIEW,
      addedByThisDeploy: [row("wizard")],
      newInRelease: [],
      selection: {
        ...PREVIEW.selection,
        desired: [...PREVIEW.selection.desired, "wizard"],
      },
    },
  },
};

export const Refused: Story = {
  args: {
    preview: null,
    error: updatePreviewNotice(new HttpError(404, "unused", "not-deployed")),
  },
};

export const Outcome: Story = {
  args: {
    outcome: {
      kind: "skills",
      rows: [
        { name: "tdd", tool: null, state: "updated" },
        { name: "jobs", tool: null, state: "updated" },
        { name: "review", tool: null, state: "removed" },
      ],
    },
  },
};

export const IncompleteOutcome: Story = {
  args: {
    incomplete: true,
    outcome: {
      kind: "skills",
      rows: [
        { name: "tdd", tool: null, state: "updated" },
        { name: "jobs", tool: "claude", state: "updated" },
        { name: "jobs", tool: "codex", state: "not-updated" },
        { name: "review", tool: null, state: "not-removed" },
      ],
    },
  },
};

const SELECTED = ["tdd", "jobs", "grill", "brief", "worktree"];
const written = (names: readonly string[]) =>
  names.map((name) => ({ name, outcome: "written" as const }));

export const GlobalUpdated: Story = {
  args: {
    targetName: "Global",
    folders: GLOBAL_FOLDERS,
    outcome: {
      kind: "folders",
      folders: {
        release: "v0.3.4",
        folders: [
          {
            path: "~/.claude/skills",
            tool: "claude",
            written: true,
            skills: written(SELECTED),
          },
          {
            path: "~/.agents/skills",
            tool: "codex",
            written: false,
            skills: [],
          },
        ],
      },
    },
  },
};

export const GlobalOneFolderBehind: Story = {
  args: {
    targetName: "Global",
    folders: GLOBAL_FOLDERS,
    incomplete: true,
    outcome: {
      kind: "folders",
      folders: {
        release: "v0.3.4",
        folders: [
          {
            path: "~/.claude/skills",
            tool: "claude",
            written: true,
            skills: written(SELECTED),
          },
          {
            path: "~/.agents/skills",
            tool: "codex",
            written: true,
            skills: [
              { name: "tdd", outcome: "not-updated", stillAt: "v0.3.2" },
              { name: "jobs", outcome: "not-updated", stillAt: null },
              { name: "grill", outcome: "missing" },
              ...written(["brief", "worktree"]),
            ],
          },
        ],
      },
    },
  },
};

export const GlobalOutcomeUnknown: Story = {
  args: {
    targetName: "Global",
    folders: GLOBAL_FOLDERS,
    outcome: { kind: "unknown" },
    error: globalUpdateNotice(new HttpError(502, "unused", "update-failed"))
      .notice,
  },
};
