import { describe, expect, it } from "vitest";
import { coreHealth } from "./health";

describe("coreHealth", () => {
  it("reports core as healthy", () => {
    expect(coreHealth()).toEqual({ ok: true, component: "core" });
  });
});
