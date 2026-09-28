import type { Meta, StoryObj } from "@storybook/react-vite";
import { HttpError } from "../api/http";
import { localEditsImportNotice } from "./import-local-edits-copy";
import { ImportLocalEditsDialog } from "./import-local-edits-dialog";

const SKILLS = [
  { name: "code-review", refusal: null },
  { name: "tdd", refusal: null },
];

const meta = {
  title: "DeployState/ImportLocalEditsDialog",
  component: ImportLocalEditsDialog,
  args: {
    targetName: "…/me/project",
    skills: SKILLS,
    checked: new Set(["code-review", "tdd"]),
    onToggle: () => {},
    isRunning: false,
    outcomes: null,
    failure: null,
    onCancel: () => {},
    onConfirm: () => {},
  },
} satisfies Meta<typeof ImportLocalEditsDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Checking: Story = { args: { skills: null } };

export const AllChecked: Story = {};

export const NoneSelected: Story = { args: { checked: new Set() } };

export const Importing: Story = { args: { isRunning: true } };

export const WithRefused: Story = {
  args: {
    skills: [
      { name: "code-review", refusal: null },
      { name: "tdd", refusal: "deployed-copy" },
      { name: "grilling", refusal: "harness-copy-uncommitted" },
    ],
    checked: new Set(["code-review"]),
  },
};

export const NoSkillQualifies: Story = {
  args: {
    skills: [{ name: "tdd", refusal: "unverified" }],
    checked: new Set(),
  },
};

export const NoLocalEdits: Story = { args: { skills: [] } };

export const PartlyImported: Story = {
  args: {
    outcomes: [
      { name: "code-review", refusal: null },
      { name: "tdd", refusal: "source-changed" },
    ],
  },
};

export const HarnessChanging: Story = {
  args: {
    failure: localEditsImportNotice(
      new HttpError(409, "unused", "import-in-progress"),
    ),
  },
};
