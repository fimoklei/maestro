import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfigUnreachableNotice } from "./config-unreachable-notice";

describe("ConfigUnreachableNotice", () => {
  // Nothing here followed a click, so the region is polite (#465).
  it("states the unreachable server politely, not as an assertive alert", () => {
    render(<ConfigUnreachableNotice onRetry={() => {}} />);

    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent(/unreachable/i);
    expect(notice).toHaveTextContent(/maestro/i);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("calls onRetry when the retry affordance is activated", async () => {
    const onRetry = vi.fn();
    render(<ConfigUnreachableNotice onRetry={onRetry} />);

    await userEvent.click(
      screen.getByRole("button", { name: /load the screen again/i }),
    );

    expect(onRetry).toHaveBeenCalledOnce();
  });
});
