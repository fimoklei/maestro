import type { Decorator, Preview } from "@storybook/react-vite";
import { useEffect } from "react";
// Self-hosted cockpit fonts, bundled (no runtime CDN fetch). The app entry will
// import these too once it adopts the design system.
import "@fontsource-variable/space-grotesk/index.css";
import "@fontsource-variable/jetbrains-mono/index.css";
import "../src/styles/theme.css";

// A toolbar switch that flips data-theme on <html>; because every component
// reads tokens (never hard-coded hex), the whole catalogue re-skins. This is
// how the dark-default / [data-theme="light"] requirement is shown visually.
export const globalTypes = {
  theme: {
    description: "Control Room theme",
    toolbar: {
      title: "Theme",
      icon: "contrast",
      items: [
        { value: "dark", title: "Dark" },
        { value: "light", title: "Light" },
      ],
      dynamicTitle: true,
    },
  },
};

export const initialGlobals = { theme: "dark" };

const withTheme: Decorator = (Story, context) => {
  const theme = (context.globals.theme as string) ?? "dark";
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);
  return (
    <div
      className="bg-canvas text-fg font-ui"
      style={{ minHeight: "100vh", padding: 24 }}
    >
      <Story />
    </div>
  );
};

const preview: Preview = {
  decorators: [withTheme],
  parameters: {
    // Backgrounds come from the token layer, not Storybook's own picker.
    backgrounds: { disable: true },
    controls: { expanded: true },
  },
};

export default preview;
