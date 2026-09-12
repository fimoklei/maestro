// The Release head's two release names are read off apm's lockfile, so they
// cross the wire only shape-checked, here at the edge (ADR-0018, security.md).
// A head failing the shape does not cross at all: the card then reads as a
// target with no known release, never as one claiming a release the server
// could not vouch for (J04).
import { RELEASE_TAG_PATTERN, type ReleaseHead } from "@maestro/core";
import { z } from "zod";

const releaseHeadSchema = z.object({
  release: z.string().regex(RELEASE_TAG_PATTERN),
  latestRelease: z.string().regex(RELEASE_TAG_PATTERN).nullable(),
  changed: z.number().int().nonnegative().nullable(),
  selected: z.number().int().nonnegative(),
  comparedAt: z.iso.datetime().nullable(),
});

// Spread into a response body: an absent key, never null, so "no head" cannot
// be mistaken for a head the server measured (#416).
export function releaseHeadFields(head: ReleaseHead | undefined): {
  releaseHead?: ReleaseHead;
} {
  if (head === undefined) {
    return {};
  }
  const parsed = releaseHeadSchema.safeParse(head);
  return parsed.success ? { releaseHead: parsed.data } : {};
}
