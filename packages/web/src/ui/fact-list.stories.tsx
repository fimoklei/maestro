import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./button";
import { FactList, FactRow } from "./fact-list";

const meta = {
  title: "Core/FactList",
  component: FactList,
  args: {
    children: (
      <>
        <FactRow label="Target">Repository</FactRow>
        <FactRow label="Path" machine fullValue="/Users/me/work/api-gateway">
          /Users/me/work/api-gateway
        </FactRow>
        <FactRow label="Release" machine>
          v0.3.4
        </FactRow>
        <FactRow label="Latest release" machine>
          v0.4.0
        </FactRow>
        <FactRow label="Changed">2 of 5 skills</FactRow>
      </>
    ),
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 328 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof FactList>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

// An action that changes the fact, beside its value.
export const WithAction: Story = {
  args: {
    children: (
      <>
        <FactRow label="Release" machine>
          v0.3.4
        </FactRow>
        <FactRow
          label="Latest release"
          machine
          action={<Button variant="primary">Update target</Button>}
        >
          v0.4.0
        </FactRow>
      </>
    ),
  },
};
