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

type Dialogs = { "import-skills": undefined; "import-prompts": undefined };

const meta = {
  title: "Shell/DialogSlot",
  component: DialogSlot<Dialogs>,
  args: {
    slot: {
      standing: { name: "import-skills", payload: undefined },
      open: () => {},
      openUnlessStanding: () => {},
      close: () => {},
      payloadOf: () => null,
    },
    dialogs: {
      "import-skills": () =>
        frame("Import skills", "Choose a folder of skills to import."),
      "import-prompts": () =>
        frame("Import prompts", "Choose prompt files to import."),
    },
  },
} satisfies Meta<typeof DialogSlot<Dialogs>>;

export default meta;

type Story = StoryObj<typeof meta>;

export const OneStanding: Story = {};
