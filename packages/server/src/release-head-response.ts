// A target card's lockfile-derived readings; one failing the shape does not cross.
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
  changedSkills: z.array(z.string().max(200)).optional(),
  selection: z.array(z.string().max(200)).optional(),
  selected: z.number().int().nonnegative(),
  comparedAt: z.iso.datetime().nullable(),
});

// Bounded on shape, not on the release pattern: a pin is any ref apm resolved.
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
    ...(readings.extraFiles === undefined
      ? {}
      : { extraFiles: readings.extraFiles }),
  };
}
