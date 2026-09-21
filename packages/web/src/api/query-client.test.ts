import { describe, expect, it } from "vitest";
import { deployStateQueryOptions } from "../deploy-state/use-deploy-state";
import { globalDeployStateQueryOptions } from "../deploy-state/use-global-deploy-state";
import { createQueryClient } from "./query-client";

describe("the cockpit's query client", () => {
  it("never retries a read, so a failure states itself at once", () => {
    const defaults = createQueryClient().getDefaultOptions().queries;

    expect(defaults?.retry).toBe(false);
  });

  it("re-reads nothing on window focus", () => {
    const defaults = createQueryClient().getDefaultOptions().queries;

    expect(defaults?.refetchOnWindowFocus).toBe(false);
  });

  it("re-reads Deploy-state's rows on window focus", () => {
    expect(
      deployStateQueryOptions("/projects/alpha").refetchOnWindowFocus,
    ).toBe(true);
    expect(globalDeployStateQueryOptions().refetchOnWindowFocus).toBe(true);
  });
});
