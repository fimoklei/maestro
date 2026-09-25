// The push resolves through `pushurl` and `pushInsteadOf`, apart from fetch:
// where they part, the skill lands in a repository the author never saw (#574).

const canonical = (url: string): string =>
  url
    .trim()
    .replace(/\/+$/, "")
    .replace(/\.git$/, "");

// Fails closed: an unreadable fetch url or no push url never matches.
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
