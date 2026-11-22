import {
  type DeployedPrimitive,
  type GitHubPage,
  OWNER_REPO_PATTERN,
  UNKNOWN_PAGE,
} from "@maestro/core";
import { z } from "zod";

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

export function githubPageField<
  K extends "github" | "releaseGitHub" | "latestReleaseGitHub",
>(key: K, page: GitHubPage | undefined): Partial<Record<K, GitHubPage>> {
  if (page === undefined) return {};
  const link = linkSchema.safeParse(page);
  return { [key]: link.success ? link.data : UNKNOWN_PAGE } as Record<
    K,
    GitHubPage
  >;
}

export const checkedPrimitives = (primitives: readonly DeployedPrimitive[]) =>
  primitives.map(({ github, ...primitive }) => ({
    ...primitive,
    ...githubPageField("github", github),
  }));
