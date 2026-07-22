import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SourceLabel } from "./source-label";

describe("SourceLabel", () => {
  it("shows the distinguishing tail, not the full path, with the whole path on hover", () => {
    // The single rendering of the connected source block, shared so the connect
    // gate's confirmation and the Settings steady state can never drift apart
    // again (the two used to split on targetLabel vs the raw path). The tail is
    // the identifying part (#211); the full path stays reachable via title.
    render(<SourceLabel path="/home/me/agent-harness" />);

    const shown = screen.getByText("…/me/agent-harness");
    expect(shown).toHaveAttribute("title", "/home/me/agent-harness");
  });

  it("names the source with its 'local folder' label", () => {
    render(<SourceLabel path="/home/me/agent-harness" />);

    expect(screen.getByText(/source · local folder/i)).toBeInTheDocument();
  });

  it("leaves a short path unshortened", () => {
    render(<SourceLabel path="/tmp/x" />);

    expect(screen.getByText("/tmp/x")).toHaveAttribute("title", "/tmp/x");
  });
});
