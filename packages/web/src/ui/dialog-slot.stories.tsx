import type { Meta, StoryObj } from "@storybook/react-vite";
import { Dialog } from "./dialog";
import { DialogSlot } from "./dialog-slot";

const frame = (title: string, body: string) => (
  <Dialog
    title={title}
    version={null}
    width={480}
    phase="idle"
    action={null}
    failure={null}
    describedBy={null}
    fieldsChanged={false}
    onClose={() => {}}
  >
    <p className="m-0">{body}</p>
  </Dialog>
);

const meta = {
  title: "Shell/DialogSlot",
  component: DialogSlot<"import-skills" | "import-prompts">,
  args: {
    standing: "import-skills",
    dialogs: {
      "import-skills": () =>
        frame("Import skills", "Choose a folder of skills to import."),
      "import-prompts": () =>
        frame("Import prompts", "Choose prompt files to import."),
    },
  },
} satisfies Meta<typeof DialogSlot<"import-skills" | "import-prompts">>;

export default meta;

type Story = StoryObj<typeof meta>;

export const OneStanding: Story = {};
