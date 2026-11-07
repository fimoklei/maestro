// The Update preview's shape check; a preview failing it does not cross at all.
import {
  isValidSkillSlug,
  RELEASE_TAG_PATTERN,
  type UpdatePreview,
} from "@maestro/core";
import { z } from "zod";

const skillName = z.string().refine(isValidSkillSlug);

const skillRow = z.object({
  name: skillName,
  // Built by core from the Harness's own origin, never from apm prose.
  url: z.url().startsWith("https://github.com/").nullable(),
});

const consentRow = z.object({
  name: skillName,
  tool: z.string().max(40).nullable(),
});

const token = z.string().regex(/^[0-9a-f]{64}$/);

const previewSchema = z.object({
  release: z.string().regex(RELEASE_TAG_PATTERN),
  chosenRelease: z.string().regex(RELEASE_TAG_PATTERN),
  counts: z.object({
    changed: z.number().int().nonnegative(),
    removed: z.number().int().nonnegative(),
    unchanged: z.number().int().nonnegative(),
  }),
  addedByThisDeploy: z.array(skillRow),
  changed: z.array(skillRow),
  removed: z.array(skillName),
  unchanged: z.array(skillName),
  newInRelease: z.array(skillRow),
  localEdits: z.object({
    discard: z.array(consentRow),
    unverified: z.array(consentRow),
  }),
  selection: z.object({
    current: z.array(skillName),
    desired: z.array(skillName),
  }),
  copyReceipt: token.nullable(),
  token,
});

export function updatePreviewBody(preview: UpdatePreview): unknown | null {
  const parsed = previewSchema.safeParse(preview);
  return parsed.success ? parsed.data : null;
}

// A row failing the shape fails the whole report rather than half-drawing a ledger (#954).
const outcomeSchema = z.array(
  z.object({
    name: skillName,
    tool: z.string().max(40).nullable(),
    state: z.enum([
      "updated",
      "removed",
      "not-updated",
      "missing",
      "not-removed",
      "unknown",
    ]),
  }),
);

const foldersSchema = z.object({
  release: z.string().regex(RELEASE_TAG_PATTERN),
  folders: z.array(
    z.object({
      path: z.string().startsWith("~/").max(200),
      tool: z.string().max(40),
      detected: z.boolean(),
      skills: z.array(
        z.discriminatedUnion("outcome", [
          z.object({
            name: skillName,
            outcome: z.enum(["written", "missing", "not-confirmed"]),
          }),
          z.object({
            name: skillName,
            outcome: z.literal("not-updated"),
            stillAt: z.string().regex(RELEASE_TAG_PATTERN).nullable(),
          }),
        ]),
      ),
    }),
  ),
});

/** The outcome's body keys; null where apm never ran or the outcome fails its shape. */
export function updateOutcomeBody(
  result: object,
): { outcome: unknown } | { folders: unknown } | null {
  if ("folders" in result) {
    const parsed = foldersSchema.safeParse(result.folders);
    return parsed.success ? { folders: parsed.data } : null;
  }
  if ("outcome" in result) {
    const parsed = outcomeSchema.safeParse(result.outcome);
    return parsed.success ? { outcome: parsed.data } : null;
  }
  return null;
}
