// The keys a table answers to, said once to the reader who is on its keyboard.

const CHECK_ROW_KEYS = "Space or X checks a row.";
const CHECK_ALL_KEYS = "Ctrl+A checks all rows.";
const ROW_MENU_KEY = "Shift+F10 opens the row menu.";

export function keyHint(keys: {
  checksRows: boolean;
  checksAll: boolean;
  opensMenu: boolean;
}): string | null {
  const sentences = [
    keys.checksRows ? CHECK_ROW_KEYS : null,
    keys.checksAll ? CHECK_ALL_KEYS : null,
    keys.opensMenu ? ROW_MENU_KEY : null,
  ].filter((sentence) => sentence !== null);
  return sentences.length === 0 ? null : sentences.join(" ");
}
