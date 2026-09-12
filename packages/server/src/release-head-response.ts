// A target card's lockfile-derived readings. Their release names are read off
// apm's lockfile, so they cross the wire only shape-checked, here at the edge
// (ADR-0018, security.md). A reading failing the shape does not cross at all:
// the card then reads as a target with no known release, never as one claiming
// a release the server could not vouch for (J04).
import {
  type PinnedPerSkill,
  RELEASE_TAG_PATTERN,
  type ReleaseHead,
} from "@maestro/core";
import { z } from "zod";

const releaseHeadSchema = z.object({
  release: z.string().regex(RELEASE_TAG_PATTERN),
  latestRelease: z.string().regex(RELEASE_TAG_PATTERN).nullable(),
  changed: z.number().int().nonnegative().nullable(),
  // Skill names read off the Harness trees, bounded like every other name the
  // server lets cross (ADR-0018).
  changedSkills: z.array(z.string().max(200)).optional(),
  selected: z.number().int().nonnegative(),
  comparedAt: z.iso.datetime().nullable(),
});

// A per-skill pin is any ref apm resolved, not only a release tag, so the
// bound is on the shape rather than on the release pattern.
const pinnedPerSkillSchema = z
  .array(
    z.object({
      release: z
        .string()
        .max(80)
        .regex(/^[A-Za-z0-9._@/+-]+$/),
      skills: z.number().int().positive(),
    }),
  )
  .nonempty();

type CardReadings = {
  releaseHead?: ReleaseHead;
  pinnedPerSkill?: PinnedPerSkill;
  extraFiles?: number;
};

// Spread into a response body: an absent key, never null, so "not read" cannot
// be mistaken for a reading the server measured (#416).
export function cardReadingFields(readings: CardReadings): CardReadings {
  const head = releaseHeadSchema.safeParse(readings.releaseHead);
  const pinned = pinnedPerSkillSchema.safeParse(readings.pinnedPerSkill);
  return {
    ...(head.success ? { releaseHead: head.data } : {}),
    ...(pinned.success ? { pinnedPerSkill: pinned.data } : {}),
    // The server's own count of the record's rows, never a line of apm prose.
    ...(readings.extraFiles === undefined
      ? {}
      : { extraFiles: readings.extraFiles }),
  };
}
