import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { app } from "@maestro/server";
import { expect } from "vitest";

const feature = await loadFeature("tests/acceptance/wiring-smoke.feature");

describeFeature(feature, ({ Scenario }) => {
  Scenario("the cockpit server reports healthy", ({ Given, When, Then }) => {
    let response: Response;

    Given("the cockpit server is wired to core", () => {
      // Niets te arrangeren: de app is statisch opgebouwd in app.ts.
    });
    When("I ask the server for its health", async () => {
      response = await app.request("/api/health");
    });
    Then("it reports that it is healthy", async () => {
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true, component: "core" });
    });
  });
});
