import { describe, expect, it } from "vitest";
import { bindConfig } from "./bind-config";

describe("bindConfig", () => {
  it("binds the loopback address only, never a network interface", () => {
    expect(bindConfig({}).hostname).toBe("127.0.0.1");
  });

  it("honours PORT", () => {
    expect(bindConfig({ PORT: "4123" }).port).toBe(4123);
  });

  it("falls back to 3000 when PORT is unset", () => {
    expect(bindConfig({}).port).toBe(3000);
  });
});
