import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SourceLabel } from "./source-label";

describe("SourceLabel", () => {
  it("shows the distinguishing tail, not the full path, with the whole path on hover", () => {
    // Shared so the connect gate and Settings can never drift apart again
    // (used to split on targetLabel vs raw path). Tail is identifying (#211).
    render(<SourceLabel path="/home/me/agent-harness" />);

    const shown = screen.getByText("…/me/agent-harness");
    expect(shown).toHaveAttribute("title", "/home/me/agent-harness");
  });

  it("names the source with its 'local folder' label", () => {
    render(<SourceLabel path="/home/me/agent-harness" />);

    expect(screen.getByText(/local folder/i)).toBeInTheDocument();
  });

  it("leaves a short path unshortened", () => {
    render(<SourceLabel path="/tmp/x" />);

    expect(screen.getByText("/tmp/x")).toHaveAttribute("title", "/tmp/x");
  });
});
