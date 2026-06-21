import { cn } from "./cn";

describe("cn", () => {
  it("joins truthy class parts with spaces", () => {
    expect(cn("a", "b", "c")).toBe("a b c");
  });

  it("drops falsy parts so optional classes can be conditional", () => {
    expect(cn("base", false, null, undefined, "extra")).toBe("base extra");
  });
});
