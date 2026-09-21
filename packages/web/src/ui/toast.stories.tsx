import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect } from "react";
import { Button } from "./button";
import { showSuccess, ToastHost } from "./toast";

// Success only: a failure is a Notice, which stays until it is acted on.
function Demo({ sentences }: { sentences: string[] }) {
  useEffect(() => {
    for (const sentence of sentences) showSuccess(sentence);
  }, [sentences]);

  return (
    <div className="flex h-[240px] items-start">
      <Button onClick={() => showSuccess(sentences[0] ?? "Done.")}>
        Show it again
      </Button>
      <ToastHost />
    </div>
  );
}

const meta = {
  title: "Shell/Toast",
  component: Demo,
} satisfies Meta<typeof Demo>;

export default meta;

type Story = StoryObj<typeof meta>;

export const OneSuccess: Story = {
  args: { sentences: ["Removed grilling v1.4.0 from maestro"] },
};

// Each success keeps its own line; none replaces another.
export const Several: Story = {
  args: {
    sentences: [
      "Removed grilling v1.4.0 from maestro",
      "Removed tdd v1.4.0 from maestro",
    ],
  },
};
