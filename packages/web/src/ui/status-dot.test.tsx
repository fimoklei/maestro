import { render } from "@testing-library/react";
import { StatusDot } from "./status-dot";

describe("StatusDot", () => {
  it("sizes the dot from the size prop as a fully-rounded square", () => {
    const { container } = render(<StatusDot size={10} />);
    const dot = container.firstChild as HTMLElement;
    expect(dot.style.width).toBe("10px");
    expect(dot.style.height).toBe("10px");
    expect(dot.style.borderRadius).toBe("5px");
  });

  it("defaults to a 6px dot", () => {
    const { container } = render(<StatusDot />);
    const dot = container.firstChild as HTMLElement;
    expect(dot.style.width).toBe("6px");
    expect(dot.style.height).toBe("6px");
  });
});
