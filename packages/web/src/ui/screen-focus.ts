import { createContext } from "react";

/**
 * Where a table screen sends focus whose place has gone: its open pane, else
 * the row now where the left one stood, else `Re-read {screen name}`.
 */
export const ScreenFocusContext = createContext<(() => void) | null>(null);
