// A GitHub page, shape-checked at the edge (ADR-0014, ADR-0018). A link
// failing the check crosses as unknown: dropping it would claim no page exists.
import type { DeployedPrimitive, GitHubPage } from "@maestro/core";
import { z } from "zod";

// A repository's page, or a page under it such as a skill folder at a tag.
const linkSchema = z.object({
  kind: z.literal("link"),
  url: z
    .url()
    .regex(
      /^https:\/\/github\.com\/[A-Za-z0-9-]+\/[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/,
    ),
});

function checked(page: GitHubPage): GitHubPage {
  const link = linkSchema.safeParse(page);
  return link.success ? link.data : { kind: "unknown" };
}

// Spread into a response body: absent where there is no page, never null.
export function githubPageField(page: GitHubPage | undefined): {
  github?: GitHubPage;
} {
  return page === undefined ? {} : { github: checked(page) };
}

// The release's page in the connected Harness, beside the Release head (#1181).
export function releaseGitHubField(page: GitHubPage | undefined): {
  releaseGitHub?: GitHubPage;
} {
  return page === undefined ? {} : { releaseGitHub: checked(page) };
}

// Each skill row's folder in the connected Harness (#1181).
export const checkedPrimitives = (primitives: readonly DeployedPrimitive[]) =>
  primitives.map(({ github, ...primitive }) => ({
    ...primitive,
    ...githubPageField(github),
  }));
