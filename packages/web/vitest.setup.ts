// Registers jest-dom matchers (toBeInTheDocument, etc.) and Testing Library's
// automatic cleanup between tests via Vitest's global afterEach.
import "@testing-library/jest-dom/vitest";

// jsdom has no top layer, so `:popover-open`, `:modal` and `:fullscreen` can
// never match — but nwsapi resolves them by brute force, spending seconds and
// tens of millions of internal checks per call. floating-ui asks on every
// Radix popover open (isTopLayer), which cost ~5s per menu and timed out the
// slowest tests. Measured against jsdom 25.0.1 / nwsapi 2.2.x.
const TOP_LAYER_SELECTORS = /:(popover-open|modal|fullscreen)\b/;
const nativeMatches = Element.prototype.matches;
// Cast: the real signature is a set of type-predicate overloads no plain
// boolean function satisfies.
Element.prototype.matches = function (
  this: Element,
  selectors: string,
): boolean {
  if (TOP_LAYER_SELECTORS.test(selectors)) return false;
  return nativeMatches.call(this, selectors);
} as typeof Element.prototype.matches;
