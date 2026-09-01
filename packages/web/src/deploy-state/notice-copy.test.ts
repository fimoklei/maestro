import { describe, expect, it } from "vitest";
import { HttpError } from "../api/http";
import { deployStateHeading, removeMessage } from "./notice-copy";

// The properties that rode on these sentences while the server owned them
// (tests/integration/server-deploy.test.ts, #684). They belong wherever the
// sentence lives.
describe("deploy and remove copy", () => {
  const codes = [
    "unsupported-primitive-type",
    "invalid-name",
    "unknown-skill",
    "inventory-not-configured",
    "repo-not-registered",
    "inventory-origin-unavailable",
    "no-published-tag",
    "local-diverged-from-tag",
    "deployed-diverged-from-lock",
    "deployed-unverifiable",
    "deployed-unreadable",
    "lockfile-malformed",
    "deploy-in-progress",
    "no-supported-tool",
    "auth-required",
    "destination-symlinked",
    "deployed-unsupported-package-type",
    "deploy-recorded-invalid",
    "deploy-unverified",
    "deploy-failed",
    "not-deployed",
    "ref-unresolvable",
    "cost-not-acknowledged",
    "remove-in-progress",
    "remove-failed",
    "preflight-failed",
  ];

  const sentences = codes.flatMap((code) => {
    const deployed = deployStateHeading(code).message;
    const removed = removeMessage(code);
    return [...(deployed ? [deployed] : []), ...(removed ? [removed] : [])];
  });

  it("carries a sentence for every deploy and remove refusal", () => {
    expect(sentences.length).toBe(32);
  });

  it("never addresses the reader as you", () => {
    for (const sentence of sentences) {
      expect(sentence).not.toMatch(/\byou\b|\byour\b/i);
    }
  });

  it("reads the deploy sentence off the code, never the thrown message", () => {
    const heading = deployStateHeading("deploy-recorded-invalid");
    expect(heading.message).toMatch(/no files arrived/i);
  });

  it("names the supported pattern for a symlinked skills directory", () => {
    const heading = deployStateHeading("destination-symlinked");
    expect(heading.message).toMatch(/replace that link/i);
    expect(heading.message).toContain("skills directory");
  });

  it("states the removal's own way through, not the deploy's", () => {
    expect(removeMessage("repo-not-registered")).toMatch(/remove again/);
    expect(deployStateHeading("repo-not-registered").message).toMatch(
      /deploy again/,
    );
  });

  it("leaves a code it does not know without a sentence", () => {
    expect(removeMessage("not-a-code")).toBeUndefined();
    expect(deployStateHeading("not-a-code").label).toBe(
      "the deploy did not run",
    );
  });

  it("keeps the message the server never sends out of the heading", () => {
    // A failure with no code at all still names what is wrong.
    const error = new HttpError(502, "boom");
    expect(deployStateHeading(error.code).label).toBe("the deploy did not run");
  });
});
