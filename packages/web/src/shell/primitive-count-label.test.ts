import { describe, expect, it } from "vitest";
import { primitiveCountLabel } from "./primitive-count-label";

describe("primitiveCountLabel", () => {
  it("reads 'reading…' while the count is not yet known", () => {
    expect(primitiveCountLabel(undefined)).toBe("reading…");
  });

  it("singularises a lone primitive", () => {
    expect(primitiveCountLabel(1)).toBe("1 primitive");
  });

  it("pluralises any other count, including zero", () => {
    expect(primitiveCountLabel(0)).toBe("0 primitives");
    expect(primitiveCountLabel(9)).toBe("9 primitives");
  });
});
