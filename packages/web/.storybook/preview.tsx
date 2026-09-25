import type { Decorator, Preview } from "@storybook/react-vite";
import { useEffect } from "react";
// The token layer, with the self-hosted Geist faces (no runtime CDN fetch).
import "../src/styles/theme.css";

// The toolbar sets data-theme on the root, as the cockpit does; no per-theme stories.
const withTheme: Decorator = (Story, context) => {
  const theme = context.globals.theme as string;
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);
  return (
    <div
      className="bg-gray-1 text-gray-12 font-ui"
      style={{ minHeight: "100vh", padding: 24 }}
    >
      <Story />
    </div>
  );
};

const preview: Preview = {
  decorators: [withTheme],
  initialGlobals: { theme: "light" },
  globalTypes: {
    theme: {
      description: "Interface theme",
      toolbar: {
        title: "Theme",
        icon: "circlehollow",
        items: [
          { value: "light", title: "Light" },
          { value: "dark", title: "Dark" },
        ],
        dynamicTitle: true,
      },
    },
  },
  parameters: {
    // Backgrounds come from the token layer, not Storybook's own picker.
    backgrounds: { disable: true },
    controls: { expanded: true },
  },
};

export default preview;
