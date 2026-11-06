import type { Meta, StoryObj } from "@storybook/react-vite";
import { HttpError } from "../api/http";
import { type DeployStateNotice, removeNotice } from "./notice-copy";
import type { RemoveRowWarning } from "./remove-preflight-view";
import { RemoveSkillDialog } from "./remove-skill-dialog";

const noticeFor = (code: string): DeployStateNotice =>
  removeNotice(new HttpError(500, "unused", code));

const repoCheck = (warning: RemoveRowWarning) =>
  ({ kind: "offered", check: { kind: "repo", warning } }) as const;

const CLAUDE = "~/.claude/skills";
const AGENTS = "~/.agents/skills";

const folderChecks = (
  warnings: Partial<Record<"claude" | "codex", RemoveRowWarning>>,
  undetected: readonly string[] = [],
) => ({
  kind: "offered" as const,
  check: {
    kind: "per-folder" as const,
    folders: (["claude", "codex"] as const).flatMap((tool) => {
      const warning = warnings[tool];
      return warning === undefined
        ? []
        : [
            {
              tool,
              path: tool === "claude" ? CLAUDE : AGENTS,
              detected: !undetected.includes(tool),
              warning,
            },
          ];
    }),
  },
});

const CHECKING = {
  kind: "offered",
  check: { kind: "unanswered", warning: "checking" },
} as const;

const meta = {
  title: "DeployState/RemoveSkillDialog",
  component: RemoveSkillDialog,
  args: {
    skillName: "tdd",
    version: "v0.5.0",
    target: {
      kind: "repo",
      repoPath: "/Users/me/acme-web",
      name: "…/me/acme-web",
    },
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
      name: "…/services/acme-web-frontend",
    },
  },
};

export const Removing: Story = { args: { isRemoving: true } };

// A removal apm did not confirm; the footer offers it again.
export const Failed: Story = {
  args: {
    error: noticeFor("remove-failed"),
  },
};

// The server's own per-target probe after a failure, as a Report.
export const FailedPerTarget: Story = {
  args: {
    target: { kind: "global", folders: [CLAUDE, AGENTS] },
    preflight: folderChecks({ claude: "none", codex: "none" }),
    error: noticeFor("remove-failed"),
    outcome: {
      scope: "global",
      tools: [
        { tool: "claude", path: "~/.claude/skills", state: "removed" },
        { tool: "codex", path: "~/.agents/skills", state: "not-removed" },
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

// A failure after warnings: the failure replaces the ledger.
export const FailedWithWarnings: Story = {
  args: {
    target: { kind: "global", folders: [AGENTS] },
    preflight: folderChecks({ codex: "cannot-verify" }),
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
    target: { kind: "global", folders: [CLAUDE, AGENTS] },
    preflight: folderChecks({ claude: "none", codex: "none" }),
  },
};

// Global's last skill: apm's named uninstall also deletes the copy in an
// undetected tool's folder, so that folder is listed, muted.
export const GlobalLastSkill: Story = {
  args: {
    target: { kind: "global", folders: [CLAUDE] },
    preflight: folderChecks({ claude: "none", codex: "none" }, ["codex"]),
  },
};

export const GlobalRefusedLocalEdits: Story = {
  args: {
    target: { kind: "global", folders: [CLAUDE] },
    preflight: {
      kind: "refused" as const,
      code: "deployed-diverged-from-lock" as const,
      notice: removeNotice(
        new HttpError(409, "unused", "deployed-diverged-from-lock", {
          folders: [AGENTS],
        }),
      ),
    },
  },
};
