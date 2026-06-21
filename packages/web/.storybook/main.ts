import type { StorybookConfig } from "@storybook/react-vite";

// The component catalogue (ADR-0004/0008). Storybook reuses the package's
// vite.config.ts, so the Tailwind plugin compiles theme.css the same way the
// app build does — the catalogue shows components on the real token layer.
const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  // No anonymous usage telemetry leaving the machine (project security stance).
  core: { disableTelemetry: true },
};

export default config;
