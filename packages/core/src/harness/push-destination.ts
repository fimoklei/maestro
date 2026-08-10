// A promotion is built on the tip a fetch brought back and its pull-request link
// is built from the configured origin — but the push resolves separately,
// through `remote.origin.pushurl` and `pushInsteadOf`. Where the two part, the
// skill lands in a repository the author was never shown (#574).

// Trailing slash and `.git` are the same repository spelled two ways; every
// other difference is one git would reach differently.
const canonical = (url: string): string =>
  url
    .trim()
    .replace(/\/+$/, "")
    .replace(/\.git$/, "");

// Fail closed: an unreadable fetch url and an unnamed destination both leave the
// two unmatched, and an unmatched push is what this guard exists to refuse. Both
// sides are what git itself resolved, so a transport rewrite pointing fetch and
// push at one mirror still matches.
export const pushesWhereItFetched = (
  fetchUrl: string | null,
  pushUrls: string[],
): boolean => {
  if (fetchUrl === null || pushUrls.length === 0) {
    return false;
  }
  const fetched = canonical(fetchUrl);
  return pushUrls.every((url) => canonical(url) === fetched);
};
