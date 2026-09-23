import type { Meta, StoryObj } from "@storybook/react-vite";
import { HttpError } from "../api/http";
import { connectNotice } from "../inventory/connect-notice";
import { SetLocationDialog } from "./set-location-dialog";

const chooser = {
  available: true,
  busy: false,
  notice: null,
  browse: () => {},
};

const meta = {
  title: "Settings/SetLocationDialog",
  component: SetLocationDialog,
  args: {
    path: "/Users/me/Projects/agent-harness",
    onPathChange: () => {},
    chooser,
    notice: null,
    busy: false,
    onSet: () => {},
    onClose: () => {},
  },
} satisfies Meta<typeof SetLocationDialog>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Open: Story = {};

// A refusal is a notice in the field's slot (#995).
export const Refused: Story = {
  args: {
    path: "/Users/me/Projects/maestro",
    notice: connectNotice(new HttpError(400, "", "not-an-inventory")),
  },
};

// A re-point never clones (#995).
export const UrlRefused: Story = {
  args: {
    path: "https://github.com/fimoklei/agent-harness",
    notice: connectNotice(new HttpError(400, "", "not-a-folder-path")),
  },
};

export const Setting: Story = {
  args: { path: "/Users/me/Work/team-harness", busy: true },
};
