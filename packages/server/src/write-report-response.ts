import {
  isValidSkillSlug,
  RELEASE_TAG_PATTERN,
  type WriteReport,
} from "@maestro/core";
import { z } from "zod";

const skillName = z.string().refine(isValidSkillSlug);
const release = z.string().regex(RELEASE_TAG_PATTERN);

const reportSkill = z.discriminatedUnion("state", [
  z.object({
    name: skillName,
    state: z.enum([
      "written",
      "already-at-release",
      "missing",
      "not-confirmed",
      "removed",
      "not-removed",
    ]),
  }),
  z.object({
    name: skillName,
    state: z.literal("not-updated"),
    stillAt: release.nullable(),
  }),
  z.object({
    name: skillName,
    state: z.literal("refused"),
    reason: z.string().regex(/^[a-z-]{1,60}$/),
  }),
]);

const writeReportSchema = z.object({
  release: release.nullable(),
  places: z.array(
    z.object({
      tool: z.enum(["claude", "codex"]),
      path: z.string().regex(/^~?\//).max(200).nullable(),
      detected: z.boolean(),
      skills: z.array(reportSkill),
    }),
  ),
});

export function writeReportBody(report: WriteReport): unknown | null {
  const parsed = writeReportSchema.safeParse(report);
  return parsed.success ? parsed.data : null;
}

export function reportField(report: WriteReport | undefined): {
  report?: unknown;
} {
  const body = report === undefined ? null : writeReportBody(report);
  return body === null ? {} : { report: body };
}
