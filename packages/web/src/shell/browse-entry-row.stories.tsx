import type { Meta, StoryObj } from "@storybook/react-vite";
import { BrowseEntryRow } from "./browse-entry-row";

// The browse listing's row in the states that read differently: what its
// badges say. Presentational and provider-free — the row takes everything
// through args (frontend.md).
const meta = {
  title: "Shell/BrowseEntryRow",
  component: BrowseEntryRow,
  args: {
    mode: "connect",
    onEnter: () => {},
    entry: {
      name: "acme-web",
      path: "/home/me/repos/acme-web",
      isHidden: false,
      isSymlink: false,
      facts: { isGitRepo: true, hasApmManifest: false },
    },
  },
} satisfies Meta<typeof BrowseEntryRow>;

export default meta;

type Story = StoryObj<typeof meta>;

// A plain folder: nothing to badge.
export const PlainFolder: Story = {};

// An inventory hint as its only badge, beside the symlink tag.
export const ConnectModeInventory: Story = {
  args: {
    entry: {
      name: "agent-harness",
      path: "/home/me/agent-harness",
      isHidden: false,
      isSymlink: true,
      facts: { isGitRepo: true, hasApmManifest: true },
    },
  },
};
