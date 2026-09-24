import { useEffect } from "react";
import { BrowserRouter } from "react-router";
import { followSystemTheme } from "./settings/interface-theme";
import { AppRoutes } from "./shell/app-router";
import { ToastHost } from "./ui/toast";

// The cockpit entry: the router renders the shell (status bar + sidebar) around
// the active view, with Deploy-state as the landing route.
export function App() {
  // index.html stamped the theme before first paint; this keeps System live.
  useEffect(followSystemTheme, []);
  return (
    <BrowserRouter>
      <AppRoutes />
      {/* One host for the whole cockpit: a success the reader may miss is
          announced from here, wherever it was made. */}
      <ToastHost />
    </BrowserRouter>
  );
}
