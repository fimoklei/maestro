import type { Meta, StoryObj } from "@storybook/react-vite";
import { machine, named, phrase } from "./phrase";
import { PhraseText } from "./phrase-text";

const meta = {
  title: "Core/PhraseText",
  component: PhraseText,
  args: {
    copy: phrase`${named("tdd")} has local edits. This update replaces them with release ${machine("v0.3.4")}.`,
  },
  render: (args) => (
    <p className="text-gray-11">
      <PhraseText {...args} />
    </p>
  ),
} satisfies Meta<typeof PhraseText>;

export default meta;

type Story = StoryObj<typeof meta>;

export const NameAndMachineValue: Story = {};

// Plain words render as they are.
export const PlainSentence: Story = {
  args: { copy: "No skill changed after deployment." },
};
