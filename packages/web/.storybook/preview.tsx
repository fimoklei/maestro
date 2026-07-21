import type { Decorator, Preview } from "@storybook/react-vite";
import { useEffect } from "react";
// Self-hosted cockpit fonts, bundled (no runtime CDN fetch). The app entry will
// import these too once it adopts the design system.
import "@fontsource-variable/space-grotesk/index.css";
import "@fontsource-variable/jetbrains-mono/index.css";
import "../src/styles/theme.css";

// Only the dark theme ships (the light ramp was removed from tokens.css — see
// issue #209 and the note there), so the catalogue renders dark. When a theme
// toggle and an AA-correct light ramp land, restore the toolbar switch here.
const withTheme: Decorator = (Story) => {
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", "dark");
  }, []);
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
