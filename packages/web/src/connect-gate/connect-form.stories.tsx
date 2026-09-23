import type { Meta, StoryObj } from "@storybook/react-vite";
import { Card } from "../ui/card";
import type { FolderChooser } from "../ui/use-folder-chooser";
import { ConnectForm } from "./connect-form";

const chooser: FolderChooser = {
  available: true,
  busy: false,
  notice: null,
  browse: () => {},
};

const meta = {
  title: "Connect Gate/ConnectForm",
  component: ConnectForm,
  args: {
    path: "https://github.com/fimoklei/agent-harness",
    onPathChange: () => {},
    pathChooser: chooser,
    cloneParent: "",
    onCloneParentChange: () => {},
    cloneChooser: chooser,
    cloneOpen: false,
    onOpenClone: () => {},
    onSubmit: () => {},
  },
  decorators: [
    (Story) => (
      <div className="max-w-[640px]">
        <Card padded>
          <Story />
        </Card>
      </div>
    ),
  ],
} satisfies Meta<typeof ConnectForm>;

export default meta;

type Story = StoryObj<typeof meta>;

export const GitHubUrl: Story = {};

export const CloneFolderOpen: Story = {
  args: { cloneOpen: true, cloneParent: "/Users/me/Work" },
};

export const CloneFolderRefused: Story = {
  args: {
    cloneOpen: true,
    cloneParent: "/Users/me/Work",
    cloneNotice: {
      level: "error",
      label: "Destination folder taken",
      message: "Choose another folder to clone into.",
      detail: "Maestro never renames or deletes what it finds.",
    },
  },
};

export const PathRefused: Story = {
  args: {
    path: "/Users/me/Projects/local-only",
    notice: {
      level: "error",
      label: "No GitHub origin",
      message: "Point the clone's origin at GitHub, or choose another clone.",
      detail:
        "Deploys read versions from GitHub tags, so the origin must be https or ssh.",
    },
  },
};

export const ScaffoldOffer: Story = {
  args: {
    path: "/Users/me/Projects/new-harness",
    notice: {
      level: "info",
      label: "Harness scaffold available",
      message:
        "Scaffold the Harness, and Maestro pushes the first commit to the default branch.",
      detail: "Maestro would scaffold it into /Users/me/Projects/new-harness.",
      action: { label: "Scaffold the Harness", onClick: () => {} },
    },
  },
};

export const Connecting: Story = { args: { isPending: true } };
