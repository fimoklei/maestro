import { useEffect } from "react";
import { BrowserRouter } from "react-router";
import { followSystemTheme } from "./settings/interface-theme";
import { AppRoutes } from "./shell/app-router";
import { ToastHost } from "./ui/toast";

export function App() {
  // index.html stamped the theme before first paint; this keeps System live.
  useEffect(followSystemTheme, []);
  return (
    <BrowserRouter>
      <AppRoutes />
      {/* One host for every toast in the cockpit. */}
      <ToastHost />
    </BrowserRouter>
  );
}
