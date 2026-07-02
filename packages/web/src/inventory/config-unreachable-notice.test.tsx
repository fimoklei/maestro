import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfigUnreachableNotice } from "./config-unreachable-notice";

describe("ConfigUnreachableNotice", () => {
  it("shows a plain-language 'server could not be reached' message as an alert", () => {
    render(<ConfigUnreachableNotice onRetry={() => {}} />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/could not (be )?reach/i);
    expect(alert).toHaveTextContent(/maestro/i);
  });

  it("calls onRetry when the retry affordance is activated", async () => {
    const onRetry = vi.fn();
    render(<ConfigUnreachableNotice onRetry={onRetry} />);

    await userEvent.click(screen.getByRole("button", { name: /try again/i }));

    expect(onRetry).toHaveBeenCalledOnce();
  });
});
