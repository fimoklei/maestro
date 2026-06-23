import { BrowserRouter } from "react-router-dom";
import { AppRoutes } from "./shell/app-router";

// The cockpit entry: the router renders the shell (status bar + sidebar) around
// the active view, with Deploy-state as the landing route.
export function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
