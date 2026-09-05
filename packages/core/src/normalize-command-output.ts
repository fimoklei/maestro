// Rich can wrap a phrase across lines. Match phrases after folding case and
// collapsing whitespace, for both APM output and Git failure messages.
export function normalizeCommandOutput(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ");
}
