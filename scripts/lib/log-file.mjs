// Shared helpers for the scripts that mirror console output into `.logs/`.

// Matches a CSI escape sequence: ESC [ params final-byte — the colour and
// cursor codes a terminal renders and a log file should not keep.
// biome-ignore lint/suspicious/noControlCharactersInRegex: an escape sequence starts with a control character by definition.
const ANSI_CSI = /\x1B\[[0-9;?]*[ -/]*[@-~]/g;

export const stripAnsi = (text) => text.replace(ANSI_CSI, "");
