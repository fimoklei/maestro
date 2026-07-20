import type { Meta, StoryObj } from "@storybook/react-vite";
import { RegisterRepoHint } from "./register-repo-hint";

const meta = {
  title: "Core/RegisterRepoHint",
  component: RegisterRepoHint,
} satisfies Meta<typeof RegisterRepoHint>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
