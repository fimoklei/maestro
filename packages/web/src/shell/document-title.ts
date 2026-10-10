import { useEffect } from "react";
import { useLocation } from "react-router";
import {
  CONNECT_TITLE,
  WELCOME_TITLE,
} from "../connect-gate/connect-gate-copy";
import { SETTINGS as SETTINGS_NAME } from "../settings/settings-copy";
import { SETTINGS_PAGES } from "../settings/settings-pages";
import { SCREENS } from "./screens";

const APP_NAME = "Maestro";

const TITLES = new Map<string, string>([
  ["/welcome", WELCOME_TITLE],
  ["/welcome/connect", CONNECT_TITLE],
  ...SCREENS.map((screen): [string, string] => [screen.to, screen.label]),
  ...SETTINGS_PAGES.map((page): [string, string] => [
    page.to,
    `${page.label} · ${SETTINGS_NAME}`,
  ]),
]);

/** Titles the document by the screen the URL shows (WCAG 2.4.2). */
export function useDocumentTitle() {
  const { pathname } = useLocation();
  const title = TITLES.get(
    pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname,
  );
  useEffect(() => {
    document.title = title === undefined ? APP_NAME : `${title} · ${APP_NAME}`;
  }, [title]);
}
