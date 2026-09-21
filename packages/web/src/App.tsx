import { BrowserRouter } from "react-router";
import { AppRoutes } from "./shell/app-router";
import { ToastHost } from "./ui/toast";

// The cockpit entry: the router renders the shell (status bar + sidebar) around
// the active view, with Deploy-state as the landing route.
export function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
      {/* One host for the whole cockpit: a success the reader may miss is
          announced from here, wherever it was made. */}
      <ToastHost />
    </BrowserRouter>
  );
}
