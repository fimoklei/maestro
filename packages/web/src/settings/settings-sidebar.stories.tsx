import type { Meta, StoryObj } from "@storybook/react-vite";
import { SETTINGS_PAGES } from "./settings-pages";
import { SettingsSidebar } from "./settings-sidebar";

const meta = {
  title: "Settings/SettingsSidebar",
  component: SettingsSidebar,
  args: {
    pages: SETTINGS_PAGES,
    active: "/settings/harness-location",
    onNavigate: () => {},
    onBack: () => {},
  },
} satisfies Meta<typeof SettingsSidebar>;

export default meta;

type Story = StoryObj<typeof meta>;

export const HarnessLocation: Story = {};

export const Appearance: Story = {
  args: { active: "/settings/appearance" },
};
