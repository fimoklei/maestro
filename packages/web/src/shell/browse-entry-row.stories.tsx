import type { Meta, StoryObj } from "@storybook/react-vite";
import { BrowseEntryRow } from "./browse-entry-row";

// The browse listing's row in the states that read differently: whether it can
// be selected at all, and what its badges say. Presentational and
// provider-free — the row takes everything through args (frontend.md).
const meta = {
  title: "Shell/BrowseEntryRow",
  component: BrowseEntryRow,
  args: {
    mode: "register",
    checked: false,
    onToggle: () => {},
    onEnter: () => {},
    entry: {
      name: "acme-web",
      path: "/home/me/repos/acme-web",
      isHidden: false,
      isSymlink: false,
      facts: { isGitRepo: true, hasSkillsSubdir: false },
    },
  },
} satisfies Meta<typeof BrowseEntryRow>;

export default meta;

type Story = StoryObj<typeof meta>;

// A git repo in register mode: selectable, badged `git`.
export const SelectableRepo: Story = {};

// Ticked for registration — the row highlights so a selection spread over
// several folders stays visible at a glance.
export const Checked: Story = { args: { checked: true } };

// Already in the registry: the box stays for alignment but is dead, and the
// badge is the reason why.
export const AlreadyRegistered: Story = {
  args: { registeredPaths: new Set(["/home/me/repos/acme-web"]) },
};

// Not a git repo: no checkbox at all, just the spacer keeping the name column
// aligned with its selectable neighbours.
export const NotARepo: Story = {
  args: {
    entry: {
      name: "scratch",
      path: "/home/me/repos/scratch",
      isHidden: false,
      isSymlink: false,
      facts: { isGitRepo: false, hasSkillsSubdir: false },
    },
  },
};

// Connect mode never selects: no checkbox, no spacer, and an inventory hint
// instead of the git badge.
export const ConnectModeInventory: Story = {
  args: {
    mode: "connect",
    entry: {
      name: "agent-harness",
      path: "/home/me/agent-harness",
      isHidden: false,
      isSymlink: true,
      facts: { isGitRepo: true, hasSkillsSubdir: true },
    },
  },
};
