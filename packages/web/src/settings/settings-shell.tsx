import { useLocation, useNavigate } from "react-router";
import { FirstRunGate } from "../shell/first-run-gate";
import { SettingsNarrowBar } from "./settings-narrow-bar";
import { SETTINGS_PAGES } from "./settings-pages";
import { SettingsSidebar } from "./settings-sidebar";

// Settings is the cockpit's third frame (#995): the sidebar is replaced by
// Back to app and the pages, beside the same panel region the cockpit uses.
export function SettingsShell() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const back = () => navigate("/");

  return (
    <div className="flex h-full min-h-0 flex-col bg-gray-2 sidebar:flex-row">
      <SettingsNarrowBar
        className="sidebar:hidden"
        pages={SETTINGS_PAGES}
        onNavigate={navigate}
        onBack={back}
      />
      <SettingsSidebar
        className="max-sidebar:hidden"
        pages={SETTINGS_PAGES}
        active={pathname}
        onNavigate={navigate}
        onBack={back}
      />
      <main className="min-h-0 min-w-0 grow p-inline pt-0 sidebar:pt-inline sidebar:pl-0">
        <FirstRunGate />
      </main>
    </div>
  );
}
