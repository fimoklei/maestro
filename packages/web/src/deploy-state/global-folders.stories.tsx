import type { Meta, StoryObj } from "@storybook/react-vite";
import { reading } from "../ui/status-reading";
import { readByLine } from "./deploy-state-copy";
import { GlobalFolders } from "./global-folders";
import type { FolderRow } from "./target-rows";
import { readByOf } from "./tool-presentation";

const folder = (
  path: string,
  tool: "claude" | "codex",
  patch: Partial<FolderRow> = {},
): FolderRow => ({
  path,
  detected: true,
  status: reading("Up to date", "good"),
  readBy: readByLine(readByOf(tool)),
  note: null,
  notUpdated: null,
  missing: null,
  strayCopies: null,
  ...patch,
});

const claude = folder("~/.claude/skills", "claude");
const agents = folder("~/.agents/skills", "codex");

const meta = {
  title: "DeployState/GlobalFolders",
  component: GlobalFolders,
  args: { folders: [claude, agents] },
} satisfies Meta<typeof GlobalFolders>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BothWritten: Story = {};

export const OneUndetected: Story = {
  args: {
    folders: [
      claude,
      { ...agents, detected: false, status: null, note: "Codex not detected" },
    ],
  },
};

export const OneWithLocalEdits: Story = {
  args: {
    folders: [
      claude,
      { ...agents, status: reading("Local edits", "attention", "⚠") },
    ],
  },
};

export const NotReadYet: Story = {
  args: {
    folders: [
      { ...claude, status: null },
      { ...agents, status: null },
    ],
  },
};
