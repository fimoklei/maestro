import type { Meta, StoryObj } from "@storybook/react-vite";
import { reading } from "./status-reading";
import { SubListGroup } from "./sub-list-group";
import { SubListRow } from "./sub-list-row";

const UP_TO_DATE = reading("Up to date", "good");

const row = (name: string) => (
  <SubListRow
    key={name}
    mark={UP_TO_DATE}
    name={name}
    value={{ text: "v0.4.1", machine: true }}
    menuLabel={`Actions for ${name}`}
    items={[{ label: "Remove skill", danger: true, onSelect: () => {} }]}
  />
);

const CLEAN = ["tdd", "jobs", "show-me"];

const meta = {
  title: "Core/SubListGroup",
  component: SubListGroup,
  args: {
    label: "Up to date",
    count: CLEAN.length,
    open: false,
    onToggle: () => {},
    children: CLEAN.map(row),
  },
  decorators: [
    (Story) => (
      <ul
        className="border-divider border-t"
        style={{ maxWidth: 328, listStyle: "none", margin: 0, padding: 0 }}
      >
        <SubListRow
          mark={{
            ...reading("Local edits", "attention", "⚠"),
            hint: "In ~/.claude/skills and ~/.agents/skills.",
          }}
          name="workflow-commit"
          value={{ text: "Both folders", machine: false }}
          menuLabel="Actions for workflow-commit"
          items={[{ label: "Import local edits", onSelect: () => {} }]}
        />
        <Story />
      </ul>
    ),
  ],
} satisfies Meta<typeof SubListGroup>;

export default meta;

type Story = StoryObj<typeof meta>;

// The list does not fit the pane: the clean rows wait behind one button.
export const Closed: Story = {};

export const Open: Story = { args: { open: true } };
