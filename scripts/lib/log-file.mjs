// A CSI escape sequence: the colour and cursor codes a log file should not keep.
// biome-ignore lint/suspicious/noControlCharactersInRegex: an escape sequence starts with a control character by definition.
const ANSI_CSI = /\x1B\[[0-9;?]*[ -/]*[@-~]/g;

export const stripAnsi = (text) => text.replace(ANSI_CSI, "");
