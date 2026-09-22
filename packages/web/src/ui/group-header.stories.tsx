import type { Meta, StoryObj } from "@storybook/react-vite";
import { GroupHeader } from "./group-header";

const meta = {
  title: "Core/GroupHeader",
  component: GroupHeader,
  args: { label: "Repositories", count: 5, columnCount: 4 },
  decorators: [
    (Story) => (
      <table style={{ width: "100%" }}>
        <tbody>
          <Story />
        </tbody>
      </table>
    ),
  ],
} satisfies Meta<typeof GroupHeader>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
