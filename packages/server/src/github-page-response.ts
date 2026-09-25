// A row's GitHub page, shape-checked at the edge (ADR-0014, ADR-0018). A link
// failing the check crosses as unknown: dropping it would claim no page exists.
import type { GitHubPage } from "@maestro/core";
import { z } from "zod";

const linkSchema = z.object({
  kind: z.literal("link"),
  url: z.url().regex(/^https:\/\/github\.com\/[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/),
});

// Spread into a response body: absent where there is no page, never null.
export function githubPageField(page: GitHubPage | undefined): {
  github?: GitHubPage;
} {
  if (page === undefined) return {};
  const link = linkSchema.safeParse(page);
  return { github: link.success ? link.data : { kind: "unknown" } };
}
