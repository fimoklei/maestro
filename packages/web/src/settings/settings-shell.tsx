import { useLocation, useNavigate } from "react-router";
import { HARNESS_CATEGORIES_CHANGED } from "../categories/categories-copy";
import { useHarnessCategoriesChanged } from "../categories/use-categories";
import { FirstRunGate } from "../shell/first-run-gate";
import { SettingsNarrowBar } from "./settings-narrow-bar";
import { CATEGORIES_PAGE, SETTINGS_PAGES } from "./settings-pages";
import { SettingsSidebar } from "./settings-sidebar";

// Settings is the cockpit's third frame (#995): the sidebar is replaced by
// Back to app and the pages, beside the same panel region the cockpit uses.
export function SettingsShell() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const back = () => navigate("/");
  const signal = useHarnessCategoriesChanged()
    ? { to: CATEGORIES_PAGE.to, text: HARNESS_CATEGORIES_CHANGED }
    : null;

  return (
    <div className="flex h-full min-h-0 flex-col bg-gray-2 sidebar:flex-row">
      <SettingsNarrowBar
        className="sidebar:hidden"
        pages={SETTINGS_PAGES}
        signal={signal}
        onNavigate={navigate}
        onBack={back}
      />
      <SettingsSidebar
        className="max-sidebar:hidden"
        pages={SETTINGS_PAGES}
        active={pathname}
        signal={signal}
        onNavigate={navigate}
        onBack={back}
      />
      <main className="min-h-0 min-w-0 grow p-inline pt-0 sidebar:pt-inline sidebar:pl-0">
        <FirstRunGate />
      </main>
    </div>
  );
}
