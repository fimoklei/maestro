import type { Meta, StoryObj } from "@storybook/react-vite";
import { RegisterRepositoryDialog } from "./register-repository-dialog";

const chooser = {
  available: true,
  busy: false,
  notice: null,
  browse: () => {},
};

const meta = {
  title: "Registry/RegisterRepositoryDialog",
  component: RegisterRepositoryDialog,
  args: {
    path: "",
    onPathChange: () => {},
    onPicked: () => {},
    chooser,
    error: undefined,
    busy: false,
    onRegister: () => {},
    onClose: () => {},
  },
} satisfies Meta<typeof RegisterRepositoryDialog>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Empty: Story = {};

// A refusal sits under the field right after the pick (#1009).
export const Refused: Story = {
  args: {
    path: "/Users/me/Projects/agent-harness",
    error: "This is the Harness, not a valid target. Register a repository.",
  },
};

export const Registering: Story = {
  args: { path: "/Users/me/Projects/maestro-docs", busy: true },
};

// Where no chooser helper exists, the field stands alone (ADR-0032).
export const NoChooser: Story = {
  args: { chooser: { ...chooser, available: false } },
};
