import type { ReclaimPreview } from "@maestro/core";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { HttpError } from "../api/http";
import { type DeployStateNotice, removeNotice } from "./notice-copy";
import type { RemoveRowWarning } from "./remove-preflight-view";
import { RemoveSkillDialog } from "./remove-skill-dialog";

const noticeFor = (code: string): DeployStateNotice =>
  removeNotice(new HttpError(500, "unused", code));

const repoCheck = (
  warning: RemoveRowWarning,
  reclaim: readonly ReclaimPreview[] = [],
) => ({ kind: "offered", check: { kind: "repo", warning }, reclaim }) as const;

const toolChecks = (
  warnings: Record<string, RemoveRowWarning>,
  reclaim: readonly ReclaimPreview[] = [],
) =>
  ({
    kind: "offered",
    check: { kind: "per-tool", warnings },
    reclaim,
  }) as const;

const CHECKING = {
  kind: "offered",
  check: { kind: "unanswered", warning: "checking" },
  reclaim: [],
} as const;

// A tool this machine no longer detects; a global removal force-deletes its copy.
const LEFTOVER: readonly ReclaimPreview[] = [
  { tool: "claude", path: "/Users/me/.claude/skills/tdd" },
];

const meta = {
  title: "DeployState/RemoveSkillDialog",
  component: RemoveSkillDialog,
  args: {
    skillName: "tdd",
    version: "v0.5.0",
    target: { kind: "repo", repoPath: "/Users/me/acme-web" },
    isRemoving: false,
    preflight: repoCheck("none"),
    error: null,
    restated: null,
    outcome: null,
    onCancel: () => undefined,
    onConfirm: () => undefined,
  },
} satisfies Meta<typeof RemoveSkillDialog>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Confirming: Story = {};

export const WithoutVersion: Story = { args: { version: null } };

export const LongSkillName: Story = {
  args: { skillName: "some-very-long-skill-name-that-keeps-going" },
};

export const LongRepoPath: Story = {
  args: {
    target: {
      kind: "repo",
      repoPath:
        "/Users/me/dev/clients/acme/platform/services/acme-web-frontend",
    },
  },
};

export const Removing: Story = { args: { isRemoving: true } };

// A removal apm did not confirm: danger red, and the footer offers it again.
export const Failed: Story = {
  args: {
    error: noticeFor("remove-failed"),
  },
};

// The server's own per-target probe after a failure; the lead-in counts from it.
export const FailedPerTarget: Story = {
  args: {
    target: { kind: "global", tools: ["claude", "codex"] },
    preflight: toolChecks({ claude: "none", codex: "none" }),
    error: noticeFor("remove-failed"),
    outcome: {
      scope: "global",
      tools: [
        { tool: "claude", state: "removed" },
        { tool: "codex", state: "not-removed" },
      ],
    },
  },
};

export const FailedOutcomeUnknown: Story = {
  args: {
    error: noticeFor("remove-failed"),
    outcome: { scope: "repo", state: "unknown" },
  },
};

export const Retrying: Story = {
  args: {
    isRemoving: true,
    error: noticeFor("remove-failed"),
  },
};

// The copy changed between the check and the click; nothing ran (#364).
export const CostRestated: Story = {
  args: {
    preflight: repoCheck("cannot-verify"),
    restated: noticeFor("cost-not-acknowledged"),
  },
};

export const RemovalRefused: Story = {
  args: {
    error: noticeFor("deployed-unreadable"),
  },
};

// The loudest state: amber warnings and a red failure stacked.
export const FailedWithWarnings: Story = {
  args: {
    target: { kind: "global", tools: ["codex"] },
    preflight: toolChecks({ codex: "cannot-verify" }, LEFTOVER),
    error: noticeFor("remove-failed"),
  },
};

export const Checking: Story = { args: { preflight: CHECKING } };

export const WithUnverifiableCopy: Story = {
  args: { preflight: repoCheck("cannot-verify") },
};

export const Unverifiable: Story = {
  args: { preflight: repoCheck("cannot-verify") },
};

export const CheckFailed: Story = {
  args: { preflight: repoCheck("check-failed") },
};

export const CheckRefused: Story = {
  args: {
    preflight: {
      kind: "refused" as const,
      code: "repo-not-registered" as const,
      notice: noticeFor("repo-not-registered"),
    },
  },
};

export const CheckRefusedLocalEdits: Story = {
  args: {
    preflight: {
      kind: "refused" as const,
      code: "deployed-diverged-from-lock" as const,
      notice: noticeFor("deployed-diverged-from-lock"),
    },
  },
};

export const GlobalScope: Story = {
  args: {
    target: { kind: "global", tools: ["claude", "codex"] },
    preflight: toolChecks({ claude: "none", codex: "none" }),
  },
};

export const GlobalScopeWithReclaim: Story = {
  args: {
    target: { kind: "global", tools: ["codex"] },
    preflight: toolChecks({ codex: "none" }, LEFTOVER),
  },
};

export const GlobalScopeWithReclaimAndUnverifiableCopy: Story = {
  args: {
    target: { kind: "global", tools: ["codex"] },
    preflight: toolChecks({ codex: "cannot-verify" }, LEFTOVER),
  },
};
