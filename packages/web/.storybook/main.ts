import type { StorybookConfig } from "@storybook/react-vite";

// Reuses the package's vite.config.ts, so stories render on the real token layer.
const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  core: { disableTelemetry: true },
};

export default config;
