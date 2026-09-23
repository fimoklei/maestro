import type { Meta, StoryObj } from "@storybook/react-vite";
import { SettingsNarrowBar } from "./settings-narrow-bar";
import { SETTINGS_PAGES } from "./settings-pages";

const meta = {
  title: "Settings/SettingsNarrowBar",
  component: SettingsNarrowBar,
  args: { pages: SETTINGS_PAGES, onNavigate: () => {}, onBack: () => {} },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 720 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SettingsNarrowBar>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
