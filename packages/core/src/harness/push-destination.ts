const canonical = (url: string): string =>
  url
    .trim()
    .replace(/\/+$/, "")
    .replace(/\.git$/, "");

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
