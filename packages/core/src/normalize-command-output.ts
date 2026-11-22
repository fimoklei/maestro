export function normalizeCommandOutput(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ");
}
