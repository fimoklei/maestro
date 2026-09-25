// A GitHub page, shape-checked at the edge (ADR-0014, ADR-0018). A link
// failing the check crosses as unknown: dropping it would claim no page exists.
import {
  type DeployedPrimitive,
  type GitHubPage,
  OWNER_REPO_PATTERN,
  UNKNOWN_PAGE,
} from "@maestro/core";
import { z } from "zod";

// A repository's page, or a page under it such as a skill folder at a tag.
const linkSchema = z.object({
  kind: z.literal("link"),
  url: z
    .url()
    .regex(
      new RegExp(
        `^https://github\\.com/${OWNER_REPO_PATTERN}(/[A-Za-z0-9._-]+)*$`,
      ),
    ),
});

// Spread into a response body: absent where there is no page, never null.
export function githubPageField<K extends "github" | "releaseGitHub">(
  key: K,
  page: GitHubPage | undefined,
): Partial<Record<K, GitHubPage>> {
  if (page === undefined) return {};
  const link = linkSchema.safeParse(page);
  return { [key]: link.success ? link.data : UNKNOWN_PAGE } as Record<
    K,
    GitHubPage
  >;
}

// Each skill row's folder in the connected Harness (#1181).
export const checkedPrimitives = (primitives: readonly DeployedPrimitive[]) =>
  primitives.map(({ github, ...primitive }) => ({
    ...primitive,
    ...githubPageField("github", github),
  }));
