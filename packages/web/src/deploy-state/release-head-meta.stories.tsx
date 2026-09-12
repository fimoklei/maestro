import type { Meta, StoryObj } from "@storybook/react-vite";
import { ReleaseHeadMeta } from "./release-head-meta";

const NOW = new Date("2026-09-12T10:00:00.000Z");

const meta = {
  title: "DeployState/ReleaseHeadMeta",
  component: ReleaseHeadMeta,
  args: {
    now: NOW,
    head: {
      release: "v0.3.2",
      latestRelease: "v0.3.4",
      changed: 2,
      selected: 5,
      comparedAt: "2026-09-12T09:59:45.000Z",
    },
  },
} satisfies Meta<typeof ReleaseHeadMeta>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Behind: Story = {};

export const InSync: Story = {
  args: {
    head: {
      release: "v0.3.4",
      latestRelease: "v0.3.4",
      changed: 0,
      selected: 5,
      comparedAt: "2026-09-12T09:59:45.000Z",
    },
  },
};

export const NothingSelectedChanged: Story = {
  args: {
    head: {
      release: "v0.3.2",
      latestRelease: "v0.3.4",
      changed: 0,
      selected: 5,
      comparedAt: "2026-09-12T09:59:45.000Z",
    },
  },
};

export const ChangesCouldNotBeRead: Story = {
  args: {
    head: {
      release: "v0.3.2",
      latestRelease: "v0.3.4",
      changed: null,
      selected: 5,
      comparedAt: "2026-09-12T08:30:00.000Z",
    },
  },
};
